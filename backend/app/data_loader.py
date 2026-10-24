"""Load the cached Parquet files once per process."""

from __future__ import annotations

from dataclasses import dataclass
from functools import lru_cache

import pandas as pd

from .config import ACTUALS_FILE, FORECASTS_FILE


@dataclass(frozen=True)
class Dataset:
    actuals: pd.DataFrame
    forecasts: pd.DataFrame
    # Peak observed wind output in the window, used to express error as % of capacity.
    # FUELHH covers transmission-metered wind only, so nameplate capacity would understate errors.
    capacity_mw: float


@lru_cache(maxsize=1)
def load() -> Dataset:
    actuals = pd.read_parquet(ACTUALS_FILE)
    forecasts = pd.read_parquet(FORECASTS_FILE)
    return Dataset(actuals=actuals, forecasts=forecasts, capacity_mw=float(actuals["generation"].max()))
