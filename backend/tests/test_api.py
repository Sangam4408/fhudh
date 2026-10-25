import pytest
from fastapi.testclient import TestClient

from app.config import FORECASTS_FILE
from app.main import app

pytestmark = pytest.mark.skipif(not FORECASTS_FILE.exists(), reason="data not downloaded")

client = TestClient(app)


def test_health():
    body = client.get("/api/health").json()
    assert body["status"] == "ok"
    assert body["windowStart"] == "2026-01-02"
    assert body["actualRows"] == 1488


def test_forecast_full_window_defaults_to_0900_cutoff():
    body = client.get("/api/forecast").json()
    assert len(body["points"]) == 1488
    assert body["pairs"] == 744
    assert body["missingForecast"] == 0
    assert body["missingActual"] == 0
    first = body["points"][0]
    assert set(first) == {"startTime", "actual", "forecast", "publishTime", "horizonH"}
    assert first["publishTime"].startswith("2026-01-01T07:30")
    assert body["points"][1]["forecast"] is None  # 00:30 has no hourly forecast


def test_single_day():
    body = client.get("/api/forecast", params={"start": "2026-01-15", "end": "2026-01-15"}).json()
    assert len(body["points"]) == 48 and body["pairs"] == 24


def test_later_decision_time_changes_forecast_source():
    params = {"start": "2026-01-15", "end": "2026-01-15", "decision_time": "16:00"}
    body = client.get("/api/forecast", params=params).json()
    assert body["points"][0]["publishTime"].startswith("2026-01-14T15:30")


def test_horizon_mode():
    body = client.get("/api/forecast", params={"start": "2026-01-15", "end": "2026-01-15", "horizon_h": 6}).json()
    horizons = [p["horizonH"] for p in body["points"] if p["horizonH"] is not None]
    assert horizons and min(horizons) >= 6


def test_metrics_shape_and_camel_case():
    body = client.get("/api/metrics").json()
    assert body["n"] == 744
    for key in ("mae", "rmse", "bias", "maePctMean", "maePctCapacity", "p10", "p50", "p90", "p90Abs"):
        assert isinstance(body[key], float)
    assert body["rmse"] >= body["mae"] > 0


@pytest.mark.parametrize("by, groups", [("hour", 24), ("day", 31), ("horizon", None)])
def test_breakdowns(by, groups):
    body = client.get("/api/metrics/breakdown", params={"by": by}).json()
    assert body["by"] == by
    if groups:
        assert len(body["rows"]) == groups
    assert sum(r["n"] for r in body["rows"]) == 744


def test_errors_and_conclusion():
    assert len(client.get("/api/errors").json()["errors"]) == 744
    assert "±" in client.get("/api/conclusion").json()["text"]


@pytest.mark.parametrize(
    "params",
    [
        {"start": "2025-12-31"},
        {"end": "2026-02-02"},
        {"start": "2026-01-20", "end": "2026-01-10"},
        {"decision_time": "09:00", "horizon_h": 24},
        {"horizon_h": 0},
        {"horizon_h": 60},
        {"decision_time": "nine"},
    ],
)
def test_invalid_params_are_422(params):
    assert client.get("/api/forecast", params=params).status_code == 422
