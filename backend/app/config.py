"""Settings shared across the backend."""

from datetime import date, time
from pathlib import Path

DATA_DIR = Path(__file__).resolve().parent.parent / "data"
ACTUALS_FILE = DATA_DIR / "fuelhh_wind.parquet"
FORECASTS_FILE = DATA_DIR / "windfor.parquet"

# Delivery days are UK calendar days; GB market times are UK local time.
UK_TZ = "Europe/London"

# Decisions made 1–31 Jan 2026 cover delivery days 2 Jan – 1 Feb 2026.
WINDOW_START = date(2026, 1, 2)
WINDOW_END = date(2026, 2, 1)

# 09:00 UK on D-1: just before the earliest GB day-ahead gate closure
# (EPEX GB 60-min auction, 09:20; Nord Pool N2EX, 09:50).
DEFAULT_DECISION_TIME = time(9, 0)
DEFAULT_HORIZON_H = 24.0
MAX_HORIZON_H = 48.0
