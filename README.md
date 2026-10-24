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

## Run the frontend (mock data for now)

```bash
cd frontend
npm install
npm run dev        # http://localhost:5173
```
