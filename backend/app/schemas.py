"""Response models. Fields are snake_case in Python and camelCase in JSON,
matching frontend/src/api/types.ts."""

from __future__ import annotations

from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict
from pydantic.alias_generators import to_camel


class CamelModel(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)


class Health(CamelModel):
    status: Literal["ok"]
    window_start: date
    window_end: date
    actual_rows: int
    forecast_rows: int
    publications: int


class ForecastPoint(CamelModel):
    start_time: datetime
    actual: float | None
    forecast: float | None
    publish_time: datetime | None
    horizon_h: float | None


class ForecastResponse(CamelModel):
    points: list[ForecastPoint]
    # Hours that should have a forecast (WINDFOR is hourly) but have none before the cutoff.
    missing_forecast: int
    missing_actual: int
    # Slots with both an actual and a forecast.
    pairs: int


class Metrics(CamelModel):
    n: int
    mae: float | None
    rmse: float | None
    bias: float | None
    mae_pct_mean: float | None
    mae_pct_capacity: float | None
    mean_actual: float | None
    capacity: float
    p10: float | None
    p50: float | None
    p90: float | None
    p90_abs: float | None


class BreakdownRow(CamelModel):
    key: str
    n: int
    mae: float
    bias: float
    p90_abs: float


class BreakdownResponse(CamelModel):
    by: Literal["hour", "horizon", "day"]
    rows: list[BreakdownRow]


class ErrorsResponse(CamelModel):
    errors: list[float]


class ConclusionResponse(CamelModel):
    text: str
