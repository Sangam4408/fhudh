"""One-off download of the Elexon BMRS data the app serves.

Fetches wind actuals (FUELHH) and wind forecasts (WINDFOR) for the January 2026
decision window, cleans them, and writes Parquet files to backend/data/.
The app reads only those files, so Elexon is never called at request time.

Usage (from the repo root):
    python scripts/fetch_data.py
    python scripts/fetch_data.py --start 2026-01-02 --end 2026-02-01
"""

from __future__ import annotations

import argparse
import sys
import time
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

import httpx
import pandas as pd

BASE_URL = "https://data.elexon.co.uk/bmrs/api/v1/datasets"
OUT_DIR = Path(__file__).resolve().parent.parent / "backend" / "data"

# Decisions on 1–31 Jan 2026 cover delivery days 2 Jan – 1 Feb 2026.
DEFAULT_START = date(2026, 1, 2)
DEFAULT_END = date(2026, 2, 1)

# Forecasts must be published before the cutoff; the earliest cutoff we allow
# is 48 h before the first slot, so fetch publications from a few days earlier.
PUBLISH_LOOKBACK = timedelta(days=4)

CHUNK = timedelta(days=7)  # a full month in one request takes ~80 s; weekly is safer
RETRIES = 4
TIMEOUT_S = 120


def get_json(client: httpx.Client, url: str, params: dict[str, str]) -> list[dict]:
    """GET with retries and exponential backoff. Stream endpoints return a JSON list."""
    for attempt in range(1, RETRIES + 1):
        try:
            res = client.get(url, params=params)
            res.raise_for_status()
            return res.json()
        except (httpx.HTTPError, ValueError) as exc:
            if attempt == RETRIES:
                raise
            wait = 2**attempt
            print(f"  retry {attempt}/{RETRIES - 1} in {wait}s ({exc})", file=sys.stderr)
            time.sleep(wait)
    return []  # unreachable


def fetch_actuals(client: httpx.Client, start: date, end: date) -> pd.DataFrame:
    rows: list[dict] = []
    day = start
    while day <= end:
        to = min(day + CHUNK - timedelta(days=1), end)
        print(f"FUELHH  settlement {day} .. {to}")
        rows += get_json(
            client,
            f"{BASE_URL}/FUELHH/stream",
            {"settlementDateFrom": day.isoformat(), "settlementDateTo": to.isoformat(), "fuelType": "WIND"},
        )
        day = to + timedelta(days=1)
    return pd.DataFrame(rows)


def fetch_forecasts(client: httpx.Client, start: date, end: date) -> pd.DataFrame:
    rows: list[dict] = []
    t = datetime.combine(start, datetime.min.time(), timezone.utc) - PUBLISH_LOOKBACK
    stop = datetime.combine(end + timedelta(days=1), datetime.min.time(), timezone.utc)
    while t < stop:
        to = min(t + CHUNK, stop)
        print(f"WINDFOR published {t:%Y-%m-%d %H:%M} .. {to:%Y-%m-%d %H:%M} UTC")
        rows += get_json(
            client,
            f"{BASE_URL}/WINDFOR/stream",
            {"publishDateTimeFrom": f"{t:%Y-%m-%dT%H:%M:%SZ}", "publishDateTimeTo": f"{to:%Y-%m-%dT%H:%M:%SZ}"},
        )
        t = to
    return pd.DataFrame(rows)


def clean_actuals(raw: pd.DataFrame, start: date, end: date) -> pd.DataFrame:
    df = raw.loc[raw["fuelType"] == "WIND", ["startTime", "publishTime", "generation"]].copy()
    df["startTime"] = pd.to_datetime(df["startTime"], utc=True)
    df["publishTime"] = pd.to_datetime(df["publishTime"], utc=True)
    df = df[in_window(df["startTime"], start, end)]
    # Keep the latest revision if a slot appears more than once.
    df = df.sort_values("publishTime").drop_duplicates("startTime", keep="last")
    return df[["startTime", "generation"]].sort_values("startTime").reset_index(drop=True)


def clean_forecasts(raw: pd.DataFrame, start: date, end: date) -> pd.DataFrame:
    df = raw[["startTime", "publishTime", "generation"]].copy()
    df["startTime"] = pd.to_datetime(df["startTime"], utc=True)
    df["publishTime"] = pd.to_datetime(df["publishTime"], utc=True)
    df = df[in_window(df["startTime"], start, end)]
    df = df.drop_duplicates(["startTime", "publishTime"], keep="last")
    return df.sort_values(["startTime", "publishTime"]).reset_index(drop=True)


def in_window(ts: pd.Series, start: date, end: date) -> pd.Series:
    lo = pd.Timestamp(start, tz="UTC")
    hi = pd.Timestamp(end + timedelta(days=1), tz="UTC")
    return (ts >= lo) & (ts < hi)


def report(actuals: pd.DataFrame, forecasts: pd.DataFrame, start: date, end: date) -> None:
    lo = pd.Timestamp(start, tz="UTC")
    hi = pd.Timestamp(end + timedelta(days=1), tz="UTC")
    half_hours = pd.date_range(lo, hi, freq="30min", inclusive="left")
    hours = pd.date_range(lo, hi, freq="1h", inclusive="left")

    missing_actual = half_hours.difference(pd.DatetimeIndex(actuals["startTime"]))
    forecast_slots = pd.DatetimeIndex(forecasts["startTime"].unique())
    missing_forecast = hours.difference(forecast_slots)
    off_hour = (forecasts["startTime"].dt.minute != 0).sum()
    pubs = forecasts["publishTime"].drop_duplicates()
    schedule = pubs.dt.strftime("%H:%M").value_counts().sort_index()

    print("\n=== Coverage report ===")
    print(f"Window: delivery {start} .. {end} ({(end - start).days + 1} days)")
    print(f"FUELHH actuals : {len(actuals):>6} rows, expected {len(half_hours)}, missing {len(missing_actual)}")
    print(f"  generation MW: min {actuals['generation'].min():.0f}, "
          f"mean {actuals['generation'].mean():.0f}, max {actuals['generation'].max():.0f}")
    print(f"WINDFOR        : {len(forecasts):>6} rows from {len(pubs)} publications")
    print(f"  hourly slots with any forecast: {len(forecast_slots)} of {len(hours)}, missing {len(missing_forecast)}")
    print(f"  rows not on the hour: {off_hour}")
    print("  publish times (UTC) x count: " + ", ".join(f"{k} x{v}" for k, v in schedule.items()))
    for label, missing in (("actual", missing_actual), ("forecast", missing_forecast)):
        if len(missing):
            shown = ", ".join(f"{t:%m-%d %H:%M}" for t in missing[:10])
            print(f"  missing {label}: {shown}{' ...' if len(missing) > 10 else ''}")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--start", type=date.fromisoformat, default=DEFAULT_START, help="first delivery day")
    parser.add_argument("--end", type=date.fromisoformat, default=DEFAULT_END, help="last delivery day")
    parser.add_argument("--out", type=Path, default=OUT_DIR, help="output directory")
    args = parser.parse_args()

    with httpx.Client(timeout=TIMEOUT_S, headers={"Accept": "application/json"}) as client:
        actuals = clean_actuals(fetch_actuals(client, args.start, args.end), args.start, args.end)
        forecasts = clean_forecasts(fetch_forecasts(client, args.start, args.end), args.start, args.end)

    args.out.mkdir(parents=True, exist_ok=True)
    actuals.to_parquet(args.out / "fuelhh_wind.parquet", index=False)
    forecasts.to_parquet(args.out / "windfor.parquet", index=False)
    print(f"\nWrote {args.out / 'fuelhh_wind.parquet'} and {args.out / 'windfor.parquet'}")

    report(actuals, forecasts, args.start, args.end)


if __name__ == "__main__":
    main()
