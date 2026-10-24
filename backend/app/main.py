"""FastAPI app: decision-time wind forecasts and their accuracy for January 2026."""

from __future__ import annotations

import math
import os
from datetime import date, time
from functools import lru_cache
from typing import Annotated, Literal

import pandas as pd
from fastapi import Depends, FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware

from . import metrics
from .config import MAX_HORIZON_H, WINDOW_END, WINDOW_START
from .data_loader import load
from .schemas import (
    BreakdownResponse,
    ConclusionResponse,
    ErrorsResponse,
    ForecastResponse,
    Health,
    Metrics,
)
from .selection import Cutoff, select_forecasts

app = FastAPI(title="UK Wind Forecast API", version="1.0.0")

# CORS_ORIGINS lists the deployed frontend URL(s); any localhost port is always allowed for local dev.
app.add_middleware(
    CORSMiddleware,
    allow_origins=[o for o in os.environ.get("CORS_ORIGINS", "").split(",") if o],
    allow_origin_regex=r"http://(localhost|127\.0\.0\.1)(:\d+)?",
    allow_methods=["GET"],
    allow_headers=["*"],
)


# ---- query parameters -------------------------------------------------------


def date_range(
    start: Annotated[date, Query(description="First delivery day (UK)")] = WINDOW_START,
    end: Annotated[date, Query(description="Last delivery day (UK), inclusive")] = WINDOW_END,
) -> tuple[date, date]:
    if not (WINDOW_START <= start <= end <= WINDOW_END):
        raise HTTPException(422, f"start and end must satisfy {WINDOW_START} <= start <= end <= {WINDOW_END}")
    return start, end


def cutoff(
    decision_time: Annotated[time | None, Query(description="Decision time on D-1, UK local, e.g. 09:00")] = None,
    horizon_h: Annotated[float | None, Query(gt=0, le=MAX_HORIZON_H, description="Hours before each slot")] = None,
) -> Cutoff:
    if decision_time is not None and horizon_h is not None:
        raise HTTPException(422, "Pass either decision_time or horizon_h, not both")
    if horizon_h is not None:
        return Cutoff(mode="horizon", horizon_h=horizon_h)
    if decision_time is not None:
        return Cutoff(mode="decision", decision_time=decision_time.replace(second=0, microsecond=0))
    return Cutoff()


Range = Annotated[tuple[date, date], Depends(date_range)]
CutoffDep = Annotated[Cutoff, Depends(cutoff)]


@lru_cache(maxsize=256)
def selected(c: Cutoff, start: date, end: date) -> pd.DataFrame:
    data = load()
    return select_forecasts(data.actuals, data.forecasts, c, start, end)


def _clean(v: float) -> float | None:
    return None if v is None or (isinstance(v, float) and math.isnan(v)) else v


# ---- routes -----------------------------------------------------------------


@app.get("/api/health", response_model=Health)
def health() -> dict:
    data = load()
    return {
        "status": "ok",
        "window_start": WINDOW_START,
        "window_end": WINDOW_END,
        "actual_rows": len(data.actuals),
        "forecast_rows": len(data.forecasts),
        "publications": data.forecasts["publishTime"].nunique(),
    }


@app.get("/api/forecast", response_model=ForecastResponse)
def forecast(r: Range, c: CutoffDep) -> dict:
    df = selected(c, *r)
    on_the_hour = df["startTime"].dt.minute == 0
    points = [
        {
            "start_time": row.startTime,
            "actual": _clean(row.actual),
            "forecast": _clean(row.forecast),
            "publish_time": None if pd.isna(row.publishTime) else row.publishTime,
            "horizon_h": _clean(row.horizon_h),
        }
        for row in df.itertuples(index=False)
    ]
    return {
        "points": points,
        "missing_forecast": int((on_the_hour & df["forecast"].isna()).sum()),
        "missing_actual": int(df["actual"].isna().sum()),
        "pairs": int((df["actual"].notna() & df["forecast"].notna()).sum()),
    }


@app.get("/api/metrics", response_model=Metrics)
def get_metrics(r: Range, c: CutoffDep) -> dict:
    m = metrics.summary(selected(c, *r), load().capacity_mw)
    return {k: _clean(v) for k, v in m.items()}


@app.get("/api/metrics/breakdown", response_model=BreakdownResponse)
def get_breakdown(r: Range, c: CutoffDep, by: Literal["hour", "horizon", "day"] = "hour") -> dict:
    return {"by": by, "rows": metrics.breakdown(selected(c, *r), by)}


@app.get("/api/errors", response_model=ErrorsResponse)
def get_errors(r: Range, c: CutoffDep) -> dict:
    return {"errors": metrics.errors(selected(c, *r))}


@app.get("/api/conclusion", response_model=ConclusionResponse)
def get_conclusion(r: Range, c: CutoffDep) -> dict:
    return {"text": metrics.conclusion(selected(c, *r), c, load().capacity_mw)}
