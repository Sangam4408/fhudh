# UK Wind Forecast App

A web app for a UK energy supplier that buys power a day ahead. It shows:

1. **The wind forecast they actually had** at decision time: the latest WINDFOR forecast published before 09:00 UK time on D-1 (configurable).
2. **How accurate those forecasts were** against actual wind generation (FUELHH): MAE, RMSE, bias, P10/P50/P90, and the buffer needed for 90% confidence.

Scope: decisions made 1–31 January 2026, so delivery days are 2 January – 1 February 2026.

> Work in progress. Live link, run instructions, and the full write-up are added as each part is finished.

## Structure

```
frontend/   React + Vite + TypeScript + Recharts (Forecast and Accuracy pages)
backend/    FastAPI + pandas (coming next)
scripts/    one-off Elexon data fetch (coming next)
```

## Data

January 2026 is fixed, so the data is downloaded once from [Elexon BMRS](https://bmrs.elexon.co.uk/) and committed as Parquet in `backend/data/`. The app never calls Elexon at runtime.

| File                  | Source                    | Content                                                               |
| --------------------- | ------------------------- | --------------------------------------------------------------------- |
| `fuelhh_wind.parquet` | FUELHH, `fuelType = WIND` | Actual wind generation, half-hourly (1,488 rows)                      |
| `windfor.parquet`     | WINDFOR                   | Wind forecasts, hourly, every publication (18,080 rows from 264 runs) |

To re-download (Python 3.12):

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate          # macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt
cd ..
python scripts/fetch_data.py    # prints a coverage report
```

## Run locally

Backend (terminal 1):

```bash
cd backend
.venv\Scripts\activate          # macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000    # API docs: http://localhost:8000/docs
pytest                                       # run the tests
```

Frontend (terminal 2):

```bash
cd frontend
npm install
copy .env.example .env          # macOS/Linux: cp .env.example .env
npm run dev                     # http://localhost:5173
```

Without `frontend/.env` the frontend runs on built-in mock data and shows a "Mock data" badge.
## live https://fhudh.vercel.app/  