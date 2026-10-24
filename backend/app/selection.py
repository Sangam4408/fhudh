"""Pick the forecast the buyer actually had when making the day-ahead decision.

For each target slot, the chosen forecast is the latest one whose publishTime is
strictly before the cutoff. Forecasts published at or after the cutoff are ignored.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, time, timedelta
from typing import Literal

import pandas as pd

from .config import DEFAULT_DECISION_TIME, DEFAULT_HORIZON_H, UK_TZ

CutoffMode = Literal["decision", "horizon"]

SLOT = pd.Timedelta(minutes=30)
OUTPUT_COLUMNS = ["startTime", "actual", "forecast", "publishTime", "horizon_h"]


@dataclass(frozen=True)
class Cutoff:
    """When the buying decision is made, relative to each target slot.

    decision: at `decision_time` UK local time on the day before delivery (D-1).
    horizon:  `horizon_h` hours before the slot starts.
    """

    mode: CutoffMode = "decision"
    decision_time: time = DEFAULT_DECISION_TIME
    horizon_h: float = DEFAULT_HORIZON_H

    def for_slots(self, start_times: pd.Series) -> pd.Series:
        """Cutoff (UTC) for each slot start (tz-aware UTC)."""
        if self.mode == "horizon":
            return start_times - pd.to_timedelta(self.horizon_h, unit="h")
        # Work in UK local time so the delivery day and the decision clock time
        # are both correct across a clock change.
        local = start_times.dt.tz_convert(UK_TZ)
        prev_day = local.dt.tz_localize(None).dt.normalize() - pd.Timedelta(days=1)
        at = pd.Timedelta(hours=self.decision_time.hour, minutes=self.decision_time.minute)
        return (prev_day + at).dt.tz_localize(UK_TZ, nonexistent="shift_forward", ambiguous=False).dt.tz_convert("UTC")


def slot_grid(start: date, end: date) -> pd.DatetimeIndex:
    """Every half-hour slot start (UTC) for UK delivery days start..end inclusive."""
    lo = pd.Timestamp(start).tz_localize(UK_TZ).tz_convert("UTC")
    hi = pd.Timestamp(end + timedelta(days=1)).tz_localize(UK_TZ).tz_convert("UTC")
    return pd.date_range(lo, hi, freq=SLOT, inclusive="left", name="startTime")


def select_forecasts(
    actuals: pd.DataFrame,
    forecasts: pd.DataFrame,
    cutoff: Cutoff,
    start: date,
    end: date,
) -> pd.DataFrame:
    """One row per half-hour slot of the delivery days start..end.

    Inputs (tz-aware UTC timestamps):
        actuals:   startTime, generation
        forecasts: startTime, publishTime, generation

    Output columns:
        startTime, actual, forecast, publishTime, horizon_h
    A slot without an actual or without an eligible forecast keeps NaN / NaT in
    those columns; it is never filled with zero.
    """
    grid = slot_grid(start, end)

    f = forecasts[(forecasts["startTime"] >= grid[0]) & (forecasts["startTime"] <= grid[-1])]
    f = f[f["publishTime"] < cutoff.for_slots(f["startTime"])]
    # Latest eligible publication per slot.
    latest = f.loc[f.groupby("startTime")["publishTime"].idxmax(), ["startTime", "publishTime", "generation"]]
    latest = latest.rename(columns={"generation": "forecast"})

    a = actuals[["startTime", "generation"]].rename(columns={"generation": "actual"})

    out = grid.to_frame(index=False).merge(a, on="startTime", how="left").merge(latest, on="startTime", how="left")
    out["horizon_h"] = (out["startTime"] - out["publishTime"]) / pd.Timedelta(hours=1)
    out["actual"] = out["actual"].astype("float64")
    out["forecast"] = out["forecast"].astype("float64")
    return out[OUTPUT_COLUMNS]
