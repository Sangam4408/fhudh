"""Forecast error metrics over the output of `select_forecasts`.

error = forecast − actual, so a positive error means wind was over-forecast and
the buyer bought too little power. Only slots with both values are scored.
"""

from __future__ import annotations

from typing import Literal

import numpy as np
import pandas as pd

from .config import UK_TZ
from .selection import Cutoff

BreakdownBy = Literal["hour", "horizon", "day"]

HORIZON_BINS = [0, 18, 24, 30, 36, np.inf]
HORIZON_LABELS = ["<18 h", "18–24 h", "24–30 h", "30–36 h", "36 h+"]


def paired(df: pd.DataFrame) -> pd.DataFrame:
    """Slots with both an actual and a forecast, plus their signed error."""
    out = df.dropna(subset=["actual", "forecast"]).copy()
    out["error"] = out["forecast"] - out["actual"]
    return out


def summary(df: pd.DataFrame, capacity_mw: float) -> dict:
    p = paired(df)
    e = p["error"].to_numpy()
    if len(e) == 0:
        nan = float("nan")
        return dict(n=0, mae=nan, rmse=nan, bias=nan, mae_pct_mean=nan, mae_pct_capacity=nan,
                    mean_actual=nan, capacity=capacity_mw, p10=nan, p50=nan, p90=nan, p90_abs=nan)
    mae = float(np.mean(np.abs(e)))
    mean_actual = float(p["actual"].mean())
    p10, p50, p90 = np.percentile(e, [10, 50, 90])
    return dict(
        n=int(len(e)),
        mae=mae,
        rmse=float(np.sqrt(np.mean(e**2))),
        bias=float(np.mean(e)),
        # Normalised by mean output rather than per slot, so near-zero hours
        # cannot blow the figure up the way MAPE does.
        mae_pct_mean=mae / mean_actual * 100,
        mae_pct_capacity=mae / capacity_mw * 100,
        mean_actual=mean_actual,
        capacity=capacity_mw,
        p10=float(p10),
        p50=float(p50),
        p90=float(p90),
        p90_abs=float(np.percentile(np.abs(e), 90)),
    )


def _group_keys(p: pd.DataFrame, by: BreakdownBy) -> pd.Series:
    local = p["startTime"].dt.tz_convert(UK_TZ)
    if by == "hour":
        return local.dt.strftime("%H:%M")
    if by == "day":
        return local.dt.strftime("%Y-%m-%d")
    return pd.cut(p["horizon_h"], HORIZON_BINS, labels=HORIZON_LABELS, right=False).astype(str)


def breakdown(df: pd.DataFrame, by: BreakdownBy) -> list[dict]:
    p = paired(df)
    if p.empty:
        return []
    p["key"] = _group_keys(p, by)
    p["abs_error"] = p["error"].abs()
    g = p.groupby("key", sort=False)
    rows = pd.DataFrame(
        {
            "n": g.size(),
            "mae": g["abs_error"].mean(),
            "bias": g["error"].mean(),
            "p90_abs": g["abs_error"].quantile(0.9),
        }
    ).reset_index()
    order = HORIZON_LABELS if by == "horizon" else sorted(rows["key"])
    rows["key"] = pd.Categorical(rows["key"], categories=order, ordered=True)
    rows = rows.sort_values("key")
    rows["key"] = rows["key"].astype(str)
    return rows.to_dict("records")


def errors(df: pd.DataFrame) -> list[float]:
    return paired(df)["error"].round(1).tolist()


def _mw(v: float) -> str:
    return f"{v:,.0f} MW"


def conclusion(df: pd.DataFrame, cutoff: Cutoff, capacity_mw: float) -> str:
    m = summary(df, capacity_mw)
    if m["n"] == 0:
        return "No hours in this selection have both a forecast and an actual, so accuracy cannot be measured."
    when = (
        f"a {cutoff.decision_time:%H:%M} D-1 decision time"
        if cutoff.mode == "decision"
        else f"a {cutoff.horizon_h:g} h forecast horizon"
    )
    direction = "over" if m["bias"] >= 0 else "under"
    effect = "buying too little power" if m["bias"] >= 0 else "buying too much power"
    hours = sorted(breakdown(df, "hour"), key=lambda r: r["mae"], reverse=True)[:3]
    days = sorted(breakdown(df, "day"), key=lambda r: r["mae"], reverse=True)[:2]
    worst_hours = ", ".join(r["key"] for r in sorted(hours, key=lambda r: r["key"]))
    worst_days = " and ".join(_day(r["key"]) for r in days)
    return (
        f"At {when}, the wind forecast missed actual output by {_mw(m['mae'])} on average "
        f"({m['mae_pct_mean']:.1f}% of mean output) and tended to {direction}-forecast by {_mw(abs(m['bias']))}, "
        f"which means {effect}. "
        f"In 90% of hours the error was within ±{_mw(m['p90_abs'])}, so holding a buffer of about that size "
        f"covers 9 in 10 hours. "
        f"Errors were largest around {worst_hours} UK time and on {worst_days}; a bigger buffer is justified then."
    )


def _day(iso: str) -> str:
    d = pd.Timestamp(iso)
    return f"{d.day} {d:%b}"
