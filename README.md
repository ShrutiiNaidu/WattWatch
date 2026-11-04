# ENERGYWISE AI

AI-Driven Electricity Consumption Anomaly Detection and Energy Loss Risk Assessment System — a B.Sc. Data Science minor project.

## What is implemented
- React + TypeScript-friendly Vite frontend (React JSX source), Recharts and Lucide icons.
- FastAPI backend with Pandas, NumPy and scikit-learn.
- SQLite persistence for datasets, records, analyses, alerts and investigation notes.
- Real Isolation Forest anomaly detection plus rolling statistical baseline detection.
- Meter-specific expected-consumption baseline using prior historical observations.
- Transparent Low / Medium / High risk screening rules.
- Synthetic multi-meter demo dataset with injected unusual events and validation issues.
- Dataset upload and validation, dashboard analytics, anomaly explorer, meter monitoring, insights, alerts, investigation history and printable reports.
- CSV analysis export and print-to-PDF report workflow.

## Important interpretation
An anomaly is a statistical screening signal. It does **not** prove electricity theft, wastage or physical energy loss. Risk scores are not calibrated probabilities.

## Run locally / Replit
### Backend
```bash
python -m pip install -r backend/requirements.txt
python run.py
```
Backend: `http://localhost:8000`

### Frontend
```bash
cd frontend
npm install
npm run dev
```
Frontend: `http://localhost:5173`

The Vite dev server proxies `/api` to the FastAPI server. For a production-style build:
```bash
cd frontend
npm run build
```

## Replit
Use a workflow that starts FastAPI on port 8000 and Vite on port 5173, or run the two commands in separate shells. The included `start.sh` installs dependencies and builds the frontend before starting FastAPI.

## Sample data
`backend/data/sample_electricity.csv` contains 4 synthetic meters over 60 days. It includes daily/weekly variation, injected unusual events, one missing reading and one duplicate-like invalid row for validation testing. It is synthetic and must not be presented as real utility data.

## API highlights
- `GET /api/health`
- `GET /api/datasets`
- `POST /api/datasets/upload`
- `POST /api/datasets/{dataset_id}/analyze`
- `GET /api/analysis/{analysis_id}/summary`
- `GET /api/analysis/{analysis_id}/anomalies`
- `GET /api/analysis/{analysis_id}/trend`
- `GET /api/meters?dataset_id=...`
- `GET /api/alerts?analysis_id=...`
- `PATCH /api/alerts/{alert_id}`
- `GET /api/reports/{analysis_id}/csv`
- `GET /api/reports/{analysis_id}/print`

## Methodology
### Anomaly detection
Isolation Forest is the primary unsupervised model. A statistical rolling-baseline method is also available. The model uses consumption, time features, rolling statistics and deviation features.

### Expected consumption
Expected consumption uses meter-specific historical comparisons by hour and weekday, using prior observations where available and falling back to a rolling meter baseline.

### Risk scoring
Risk combines anomaly signal, deviation magnitude, unusual magnitude and repeated patterns, with a penalty when no reliable baseline is available. The score is intentionally documented as decision support rather than a prediction probability.

## Limitations
No supervised loss/theft classifier is claimed because the project does not contain verified labels. Accuracy, precision, recall and F1 are not fabricated. Physical investigation and domain context remain necessary.
