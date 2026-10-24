from datetime import date, time

import pandas as pd
import pytest

from app.config import ACTUALS_FILE, FORECASTS_FILE
from app.selection import Cutoff, select_forecasts, slot_grid

DAY = date(2026, 1, 11)  # delivery day D; decisions are made on 10 Jan


def ts(s: str) -> pd.Timestamp:
    return pd.Timestamp(s, tz="UTC")


def forecasts(*rows: tuple[str, str, float]) -> pd.DataFrame:
    """rows: (startTime, publishTime, generation)."""
    return pd.DataFrame(
        {
            "startTime": [ts(r[0]) for r in rows],
            "publishTime": [ts(r[1]) for r in rows],
            "generation": [r[2] for r in rows],
        }
    )


def actuals(*rows: tuple[str, float]) -> pd.DataFrame:
    return pd.DataFrame({"startTime": [ts(r[0]) for r in rows], "generation": [r[1] for r in rows]})


def slot(df: pd.DataFrame, start_time: str) -> pd.Series:
    return df.loc[df["startTime"] == ts(start_time)].iloc[0]


def run(a: pd.DataFrame, f: pd.DataFrame, cutoff: Cutoff = Cutoff()) -> pd.DataFrame:
    return select_forecasts(a, f, cutoff, DAY, DAY)


def test_picks_latest_forecast_before_cutoff():
    f = forecasts(
        ("2026-01-11 14:00", "2026-01-09 18:30", 9800),
        ("2026-01-11 14:00", "2026-01-10 04:30", 10200),
        ("2026-01-11 14:00", "2026-01-10 07:30", 10450),
        ("2026-01-11 14:00", "2026-01-10 09:30", 10900),  # after 09:00 cutoff
        ("2026-01-11 14:00", "2026-01-10 15:30", 11300),  # after 09:00 cutoff
    )
    row = slot(run(actuals(("2026-01-11 14:00", 10320)), f), "2026-01-11 14:00")
    assert row["forecast"] == 10450
    assert row["publishTime"] == ts("2026-01-10 07:30")
    assert row["horizon_h"] == 30.5
    assert row["actual"] == 10320


def test_forecast_published_exactly_at_cutoff_is_too_late():
    f = forecasts(
        ("2026-01-11 10:00", "2026-01-10 07:30", 5000),
        ("2026-01-11 10:00", "2026-01-10 09:00", 6000),
    )
    assert slot(run(actuals(), f), "2026-01-11 10:00")["forecast"] == 5000


def test_slot_with_only_late_forecasts_is_missing_not_zero():
    f = forecasts(("2026-01-11 10:00", "2026-01-10 09:30", 6000))
    row = slot(run(actuals(("2026-01-11 10:00", 7000)), f), "2026-01-11 10:00")
    assert pd.isna(row["forecast"])
    assert pd.isna(row["publishTime"])
    assert pd.isna(row["horizon_h"])
    assert row["actual"] == 7000


def test_missing_actual_is_nan_not_zero():
    f = forecasts(("2026-01-11 10:00", "2026-01-10 07:30", 5000))
    row = slot(run(actuals(), f), "2026-01-11 10:00")
    assert pd.isna(row["actual"])
    assert row["forecast"] == 5000


def test_half_hour_slots_without_hourly_forecast_are_missing_forecast():
    f = forecasts(("2026-01-11 10:00", "2026-01-10 07:30", 5000))
    a = actuals(("2026-01-11 10:00", 5100), ("2026-01-11 10:30", 5200))
    out = run(a, f)
    assert slot(out, "2026-01-11 10:00")["forecast"] == 5000
    half = slot(out, "2026-01-11 10:30")
    assert half["actual"] == 5200 and pd.isna(half["forecast"])


def test_output_has_one_row_per_half_hour_of_delivery_day():
    out = run(actuals(), forecasts(("2026-01-11 10:00", "2026-01-10 07:30", 5000)))
    assert len(out) == 48
    assert out["startTime"].iloc[0] == ts("2026-01-11 00:00")
    assert out["startTime"].iloc[-1] == ts("2026-01-11 23:30")
    assert list(out.columns) == ["startTime", "actual", "forecast", "publishTime", "horizon_h"]


def test_forecasts_outside_delivery_range_are_ignored():
    f = forecasts(("2026-01-12 10:00", "2026-01-10 07:30", 5000))
    assert run(actuals(), f)["forecast"].isna().all()


def test_later_decision_time_uses_fresher_forecast():
    f = forecasts(
        ("2026-01-11 14:00", "2026-01-10 07:30", 10450),
        ("2026-01-11 14:00", "2026-01-10 15:30", 11300),
    )
    row = slot(run(actuals(), f, Cutoff(decision_time=time(16, 0))), "2026-01-11 14:00")
    assert row["forecast"] == 11300


def test_horizon_mode_matches_equivalent_decision_time():
    # 09:00 on 10 Jan is 29 h before 14:00 on 11 Jan.
    f = forecasts(
        ("2026-01-11 14:00", "2026-01-10 07:30", 10450),
        ("2026-01-11 14:00", "2026-01-10 09:30", 10900),
    )
    by_decision = slot(run(actuals(), f, Cutoff(mode="decision")), "2026-01-11 14:00")
    by_horizon = slot(run(actuals(), f, Cutoff(mode="horizon", horizon_h=29)), "2026-01-11 14:00")
    assert by_decision["forecast"] == by_horizon["forecast"] == 10450


def test_horizon_mode_cutoff_is_hours_before_slot():
    f = forecasts(
        ("2026-01-11 14:00", "2026-01-11 07:30", 1),  # 6.5 h before
        ("2026-01-11 14:00", "2026-01-11 11:30", 2),  # 2.5 h before
    )
    assert slot(run(actuals(), f, Cutoff(mode="horizon", horizon_h=4)), "2026-01-11 14:00")["forecast"] == 1
    assert slot(run(actuals(), f, Cutoff(mode="horizon", horizon_h=2)), "2026-01-11 14:00")["forecast"] == 2


def test_month_boundary_decision_on_31_jan_for_1_feb():
    f = forecasts(
        ("2026-02-01 00:00", "2026-01-31 07:30", 4000),
        ("2026-02-01 00:00", "2026-01-31 09:30", 4500),
    )
    out = select_forecasts(actuals(), f, Cutoff(), date(2026, 2, 1), date(2026, 2, 1))
    row = slot(out, "2026-02-01 00:00")
    assert row["forecast"] == 4000
    assert row["horizon_h"] == 16.5


def test_decision_cutoff_uses_uk_local_time_in_summer():
    # In BST (UTC+1), 09:00 UK on D-1 is 08:00 UTC.
    cut = Cutoff().for_slots(pd.Series([ts("2026-07-11 12:00")]))
    assert cut.iloc[0] == ts("2026-07-10 08:00")


def test_slot_grid_spans_whole_days():
    grid = slot_grid(date(2026, 1, 2), date(2026, 2, 1))
    assert len(grid) == 31 * 48


@pytest.mark.skipif(not FORECASTS_FILE.exists(), reason="data not downloaded")
def test_real_data_every_hour_has_a_pre_cutoff_forecast():
    a = pd.read_parquet(ACTUALS_FILE)
    f = pd.read_parquet(FORECASTS_FILE)
    out = select_forecasts(a, f, Cutoff(), date(2026, 1, 2), date(2026, 2, 1))
    paired = out.dropna(subset=["actual", "forecast"])
    assert len(out) == 1488
    assert len(paired) == 744
    # No forecast used was published at or after its cutoff.
    assert (paired["publishTime"] < Cutoff().for_slots(paired["startTime"])).all()
    assert paired["horizon_h"].between(16.5, 39.5).all()
