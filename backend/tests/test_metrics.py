import math

import pandas as pd
import pytest

from app import metrics
from app.selection import Cutoff


def frame(rows: list[tuple[str, float | None, float | None, float | None]]) -> pd.DataFrame:
    """rows: (startTime, actual, forecast, horizon_h)."""
    return pd.DataFrame(
        {
            "startTime": [pd.Timestamp(r[0], tz="UTC") for r in rows],
            "actual": [r[1] for r in rows],
            "forecast": [r[2] for r in rows],
            "publishTime": [pd.NaT] * len(rows),
            "horizon_h": [r[3] for r in rows],
        }
    ).astype({"actual": "float64", "forecast": "float64", "horizon_h": "float64"})


# errors: +100, -300, +200, 0  →  MAE 150, bias 0, RMSE sqrt(35000)
SAMPLE = frame(
    [
        ("2026-01-11 10:00", 1000, 1100, 17),
        ("2026-01-11 11:00", 2000, 1700, 20),
        ("2026-01-12 10:00", 3000, 3200, 25),
        ("2026-01-12 11:00", 4000, 4000, 37),
        ("2026-01-12 11:30", 4100, None, None),  # no forecast: ignored
        ("2026-01-12 12:00", None, 5000, 38),  # no actual: ignored
    ]
)


def test_summary_matches_hand_computed_values():
    m = metrics.summary(SAMPLE, capacity_mw=10_000)
    assert m["n"] == 4
    assert m["mae"] == 150
    assert m["bias"] == 0
    assert m["rmse"] == pytest.approx(math.sqrt(35_000))
    assert m["mean_actual"] == 2500
    assert m["mae_pct_mean"] == pytest.approx(6.0)
    assert m["mae_pct_capacity"] == pytest.approx(1.5)


def test_percentiles_use_signed_and_absolute_errors():
    m = metrics.summary(SAMPLE, capacity_mw=10_000)
    # signed errors sorted: -300, 0, 100, 200 (linear interpolation)
    assert m["p50"] == pytest.approx(50)
    assert m["p10"] == pytest.approx(-210)
    assert m["p90"] == pytest.approx(170)
    # absolute errors sorted: 0, 100, 200, 300
    assert m["p90_abs"] == pytest.approx(270)


def test_summary_of_empty_selection_is_nan_not_error():
    m = metrics.summary(frame([("2026-01-11 10:30", 1000, None, None)]), capacity_mw=10_000)
    assert m["n"] == 0 and math.isnan(m["mae"])


def test_breakdown_by_hour_groups_uk_clock_time():
    rows = {r["key"]: r for r in metrics.breakdown(SAMPLE, "hour")}
    assert set(rows) == {"10:00", "11:00"}
    assert rows["10:00"]["n"] == 2 and rows["10:00"]["mae"] == 150  # |+100|, |+200|
    assert rows["11:00"]["bias"] == -150  # -300, 0


def test_breakdown_by_day():
    rows = metrics.breakdown(SAMPLE, "day")
    assert [r["key"] for r in rows] == ["2026-01-11", "2026-01-12"]
    assert rows[0]["mae"] == 200 and rows[1]["mae"] == 100


def test_breakdown_by_horizon_uses_ordered_buckets():
    keys = [r["key"] for r in metrics.breakdown(SAMPLE, "horizon")]
    assert keys == ["<18 h", "18–24 h", "24–30 h", "36 h+"]


def test_errors_are_forecast_minus_actual():
    assert metrics.errors(SAMPLE) == [100, -300, 200, 0]


def test_conclusion_states_buffer_and_direction():
    over = frame([("2026-01-11 10:00", 1000, 1500, 20), ("2026-01-11 11:00", 1000, 1300, 21)])
    text = metrics.conclusion(over, Cutoff(), capacity_mw=10_000)
    assert "09:00 D-1" in text
    assert "over-forecast" in text and "buying too little" in text
    assert "±" in text
