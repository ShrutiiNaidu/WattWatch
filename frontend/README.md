# ENERGYWISE AI Frontend

React + TypeScript + Vite interface for the ENERGYWISE AI FastAPI backend.

Run:
```bash
npm install
npm run dev
```

The Vite dev server proxies `/api` to `http://127.0.0.1:8000`.
If the backend uses a different port, set `ENERGYWISE_API_TARGET` before starting Vite, for example:

PowerShell:
```powershell
$env:ENERGYWISE_API_TARGET = "http://127.0.0.1:8001"
npm run dev -- --port 5174
```
