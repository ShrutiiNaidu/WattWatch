"""
WattWatch — FastAPI application.
"""

from __future__ import annotations

import csv
import io
import json
import tempfile
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import pandas as pd
from fastapi import FastAPI, File, HTTPException, Query, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse, StreamingResponse
from pydantic import BaseModel

from .db import get_conn, init_db
from .ml import analyze
from .preprocessing import validate_and_enrich, validate_frame
from .reports import render_wattwatch_report

ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / "data"
SAMPLE = DATA_DIR / "sample_electricity.csv"
DATA_DIR.mkdir(exist_ok=True)

app = FastAPI(title="WattWatch", version="2.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# ─── Pydantic models ──────────────────────────────────────────────────────────

class AlertPatch(BaseModel):
    status: str | None = None
    notes: str | None = None


# ─── Helpers ──────────────────────────────────────────────────────────────────

def now() -> str:
    return datetime.now(timezone.utc).isoformat()


def dataset_row(did: int) -> dict:
    conn = get_conn()
    r = conn.execute("SELECT * FROM datasets WHERE id=?", (did,)).fetchone()
    conn.close()
    if not r:
        raise HTTPException(404, "Dataset not found")
    return dict(r)


def latest_analysis(did: int) -> dict | None:
    conn = get_conn()
    r = conn.execute(
        "SELECT * FROM analysis_runs WHERE dataset_id=? ORDER BY id DESC LIMIT 1", (did,)
    ).fetchone()
    conn.close()
    return dict(r) if r else None


def rows_for(did: int) -> pd.DataFrame:
    conn = get_conn()
    rows = conn.execute(
        "SELECT * FROM records WHERE dataset_id=? ORDER BY timestamp", (did,)
    ).fetchall()
    conn.close()
    df = pd.DataFrame([dict(r) for r in rows])
    if not df.empty:
        df["timestamp"] = pd.to_datetime(df["timestamp"], errors="coerce")
    return df


def summary_from(df: pd.DataFrame, a: dict) -> dict:
    ds = dataset_row(a["dataset_id"])
    sev_breakdown = {"Low": 0, "Medium": 0, "High": 0}
    if not df.empty and "severity" in df.columns:
        for sev, cnt in df[df.anomaly == -1].groupby("severity").size().items():
            if sev in sev_breakdown:
                sev_breakdown[sev] = int(cnt)
    excess_kwh = round(float(df.loc[(df.deviation > 0) & df.expected.notna(), "deviation"].sum()), 2) if not df.empty else 0.0
    return {
        "analysis_id":          a["id"],
        "dataset_id":           a["dataset_id"],
        "records":              int(len(df)),
        "total_energy_kwh":     round(float(df.consumption.sum()), 2) if not df.empty else 0.0,
        "average_daily_kwh":    round(float(df.groupby(df.timestamp.dt.date).consumption.sum().mean()), 2) if not df.empty else 0.0,
        "anomalies":            int((df.anomaly == -1).sum()) if not df.empty else 0,
        "high_risk":            int((df.risk_score >= 60).sum()) if not df.empty else 0,
        "estimated_excess_kwh": excess_kwh,
        "meters":               int(df.meter_id.nunique()) if not df.empty else 0,
        "demo":                 bool(ds["is_demo"]),
        "severity_breakdown":   sev_breakdown,
    }


# ─── Startup ──────────────────────────────────────────────────────────────────

@app.on_event("startup")
def startup() -> None:
    init_db()
    ensure_demo()


def ensure_demo() -> None:
    conn = get_conn()
    row = conn.execute(
        "SELECT id FROM datasets WHERE is_demo=1 ORDER BY id LIMIT 1"
    ).fetchone()
    conn.close()
    if not row:
        generate_sample()
        did, *_ = _load_dataset(SAMPLE, "Synthetic Demo Dataset", True)
        _run_analysis(did, "isolation_forest", 0.01)


def generate_sample() -> None:
    rng = np.random.default_rng(42)
    ts  = pd.date_range("2026-01-01", periods=24 * 60, freq="h")
    rows = []
    for mi in range(1, 5):
        base = 1.5 + mi * 0.55
        for t in ts:
            daily   = 0.55 * np.sin((t.hour - 7) / 24 * 2 * np.pi) + 0.35 * np.sin((t.hour - 18) / 24 * 2 * np.pi)
            weekend = -0.25 if t.dayofweek >= 5 else 0
            val     = max(0.05, base + daily + weekend + rng.normal(0, 0.12))
            if (mi, t.day, t.hour) in [(2, 12, 2), (2, 12, 3), (3, 27, 19), (4, 41, 11), (1, 53, 23), (3, 54, 0)]:
                val *= 3.2
            rows.append([t, f"METER-{mi:03d}", f"BLDG-{(mi + 1) // 2:02d}", round(val, 3)])
    df = pd.DataFrame(rows, columns=["timestamp", "meter_id", "building_id", "consumption"])
    df.loc[10, "consumption"] = np.nan
    df.loc[11] = df.loc[10]
    df.to_csv(SAMPLE, index=False)


def _load_dataset(path: Path, name: str, is_demo: bool = False):
    raw = pd.read_csv(path)
    result = validate_and_enrich(raw)
    issues    = result.issues_as_dicts()
    invalid   = result.invalid_mask
    warnings  = result.warnings_as_dicts()
    warn_strs = [w.message for w in result.warnings]
    conn = get_conn()
    cur  = conn.execute(
        "INSERT INTO datasets(name,source,is_demo,created_at,records,valid_records,invalid_records,warnings_json) VALUES(?,?,?,?,?,?,?,?)",
        (name, "demo" if is_demo else "upload", int(is_demo), now(), len(raw), int((~invalid).sum()), int(invalid.sum()), json.dumps(warn_strs)),
    )
    did = cur.lastrowid
    conn.commit()
    conn.close()

    clean = result.clean[~invalid].drop_duplicates(["timestamp", "meter_id"]).sort_values("timestamp")
    conn = get_conn()
    for r in clean.itertuples(index=False):
        conn.execute(
            "INSERT INTO records(dataset_id,timestamp,meter_id,building_id,consumption) VALUES(?,?,?,?,?)",
            (did, r.timestamp.isoformat(), r.meter_id, r.building_id, float(r.consumption)),
        )
    conn.commit()
    conn.close()
    return did, result.mapping, issues, warnings


def _run_analysis(did: int, algorithm: str = "isolation_forest", sensitivity: float = 0.01) -> int:
    row  = dataset_row(did)
    conn = get_conn()
    db_rows = conn.execute("SELECT * FROM records WHERE dataset_id=? ORDER BY timestamp", (did,)).fetchall()
    conn.close()
    df = pd.DataFrame([dict(r) for r in db_rows])
    if df.empty:
        raise HTTPException(400, "Dataset has no valid records.")
    df["timestamp"] = pd.to_datetime(df.timestamp)

    result = analyze(df[["timestamp", "meter_id", "building_id", "consumption"]], algorithm, sensitivity)
    frame  = result.frame

    conn = get_conn()
    cur  = conn.execute(
        "INSERT INTO analysis_runs(dataset_id,algorithm,sensitivity,created_at,records_analyzed,anomalies,high_risk,model_metadata_json) VALUES(?,?,?,?,?,?,?,?)",
        (
            did, algorithm, float(sensitivity), now(),
            len(frame),
            int((frame.anomaly == -1).sum()),
            int((frame.risk_score >= 60).sum()),
            json.dumps(result.metadata),
        ),
    )
    aid = cur.lastrowid
    conn.execute("DELETE FROM records WHERE dataset_id=?", (did,))

    for r in frame.itertuples(index=False):
        sev = getattr(r, "severity", None)
        conn.execute(
            """INSERT INTO records(
                dataset_id,timestamp,meter_id,building_id,consumption,
                expected,deviation,deviation_pct,anomaly,anomaly_score,
                risk_score,risk_level,explanation,severity
            ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
            (
                did,
                r.timestamp.isoformat(),
                r.meter_id,
                r.building_id,
                float(r.consumption),
                None if pd.isna(r.expected)      else float(r.expected),
                None if pd.isna(r.deviation)     else float(r.deviation),
                None if pd.isna(r.deviation_pct) else float(r.deviation_pct),
                int(r.anomaly),
                None if pd.isna(r.anomaly_score) else float(r.anomaly_score),
                None if pd.isna(r.risk_score)    else float(r.risk_score),
                None if pd.isna(r.risk_level)    else str(r.risk_level),
                str(r.explanation),
                sev,
            ),
        )

    # Create alert entries for anomalies
    for r in frame[frame.anomaly == -1].itertuples(index=False):
        key = f"{r.timestamp.strftime('%Y-%m-%dT%H:%M:%S')}|{r.meter_id}"
        conn.execute(
            "INSERT OR IGNORE INTO alerts(analysis_id,record_key,status,notes,updated_at) VALUES(?,?,?,?,?)",
            (aid, key, "Open", "", now()),
        )

    conn.commit()
    conn.close()
    return aid


# ─── Endpoints ────────────────────────────────────────────────────────────────

@app.get("/api/health")
def health():
    return {"status": "ok", "service": "WattWatch"}


@app.get("/api/datasets")
def datasets():
    conn = get_conn()
    rs = conn.execute("SELECT * FROM datasets ORDER BY id DESC").fetchall()
    conn.close()
    return [dict(r) for r in rs]


@app.get("/api/datasets/{dataset_id}")
def dataset(dataset_id: int):
    r = dataset_row(dataset_id)
    r["warnings"] = json.loads(r.pop("warnings_json") or "[]")
    r["analysis"] = latest_analysis(dataset_id)
    return r


@app.post("/api/datasets/upload")
async def upload(file: UploadFile = File(...)):
    if not file.filename.lower().endswith(".csv"):
        raise HTTPException(400, "Please upload a CSV file.")
    data = await file.read()
    if len(data) > 15 * 1024 * 1024:
        raise HTTPException(413, "File is larger than the 15 MB upload limit.")
    try:
        raw = pd.read_csv(io.BytesIO(data))
    except Exception as e:
        raise HTTPException(400, f"Could not read CSV: {e}")

    try:
        result = validate_and_enrich(raw)
    except ValueError as e:
        raise HTTPException(400, str(e))

    if len(raw) < 20:
        raise HTTPException(400, "The dataset is too small. Provide at least 20 rows.")

    path = DATA_DIR / f"upload_{datetime.now().strftime('%Y%m%d_%H%M%S_%f')}.csv"
    raw.to_csv(path, index=False)
    did, _, issues, _ = _load_dataset(path, file.filename, False)

    quality = {
        "total":          len(raw),
        "valid":          int((~result.invalid_mask).sum()),
        "invalid":        int(result.invalid_mask.sum()),
        "issues":         result.issues_as_dicts(),
        "warnings":       result.warnings_as_dicts(),
        "blocking_errors": [i.to_dict() for i in result.issues if i.count > 0],
        "can_proceed":    not result.blocking,
    }
    return {"dataset_id": did, "name": file.filename, "mapping": result.mapping, "quality": quality}


@app.post("/api/datasets/sample/load")
def load_sample():
    did, mapping, issues, warnings = _load_dataset(SAMPLE, "Synthetic Demo Dataset", True)
    return {"dataset_id": did, "demo": True, "warnings": [w["message"] for w in warnings]}


@app.post("/api/datasets/{dataset_id}/analyze")
def analyze_dataset(
    dataset_id: int,
    algorithm:   str   = Query("isolation_forest"),
    sensitivity: float = Query(0.01, ge=0.005, le=0.20),
):
    try:
        aid = _run_analysis(dataset_id, algorithm, sensitivity)
    except ValueError as e:
        raise HTTPException(400, str(e))
    return {"analysis_id": aid}


@app.get("/api/analysis/{analysis_id}")
def analysis(analysis_id: int):
    conn = get_conn()
    a = conn.execute("SELECT * FROM analysis_runs WHERE id=?", (analysis_id,)).fetchone()
    conn.close()
    if not a:
        raise HTTPException(404, "Analysis not found")
    out = dict(a)
    out["metadata"] = json.loads(out.pop("model_metadata_json") or "{}")
    return out


@app.get("/api/analysis/{analysis_id}/summary")
def summary(analysis_id: int):
    conn = get_conn()
    a = conn.execute("SELECT * FROM analysis_runs WHERE id=?", (analysis_id,)).fetchone()
    conn.close()
    if not a:
        raise HTTPException(404, "Analysis not found")
    df = rows_for(a["dataset_id"])
    return summary_from(df, a)


@app.get("/api/analysis/{analysis_id}/anomalies")
def anomalies(
    analysis_id: int,
    meter_id:    str | None = None,
    q:           str | None = None,
    min_risk:    float = 0,
    limit:       int   = 500,
    tariff:      float = Query(8.0, ge=0.0),
):
    conn = get_conn()
    a = conn.execute("SELECT * FROM analysis_runs WHERE id=?", (analysis_id,)).fetchone()
    conn.close()
    if not a:
        raise HTTPException(404, "Analysis not found")

    df = rows_for(a["dataset_id"])
    df = df[(df.anomaly == -1) & (df.risk_score.fillna(0) >= min_risk)]
    if meter_id:
        df = df[df.meter_id == meter_id]
    if q:
        df = df[df.meter_id.str.contains(q, case=False, na=False)]

    # Enrich with cost fields
    records = df.sort_values("risk_score", ascending=False).head(limit).copy()
    records["excess_kwh"] = (records["deviation"]).clip(lower=0)
    records["estimated_cost"] = (records["excess_kwh"] * tariff).round(2)

    # Ensure severity column exists (older analyses may not have it)
    if "severity" not in records.columns:
        records["severity"] = records.apply(
            lambda r: (
                "High" if (r.get("risk_score") or 0) >= 60
                else "Medium" if (r.get("risk_score") or 0) >= 30
                else "Low"
            ),
            axis=1,
        )

    return records.replace({np.nan: None}).to_dict("records")


@app.get("/api/analysis/{analysis_id}/trend")
def trend(analysis_id: int, days: int = 60, meter_id: str | None = None):
    conn = get_conn()
    a = conn.execute("SELECT * FROM analysis_runs WHERE id=?", (analysis_id,)).fetchone()
    conn.close()
    if not a:
        raise HTTPException(404, "Analysis not found")
    df = rows_for(a["dataset_id"])
    if meter_id:
        df = df[df.meter_id == meter_id]
    if df.empty:
        return []
    cutoff = df.timestamp.max() - pd.Timedelta(days=days)
    df = df[df.timestamp >= cutoff]

    # Include rolling_7d_avg if stored; otherwise compute on-the-fly
    cols = ["timestamp", "meter_id", "consumption", "expected", "deviation_pct", "anomaly", "risk_score"]
    if "rolling_7d_avg" in df.columns:
        cols.append("rolling_7d_avg")
    else:
        # Compute a simple 7d rolling mean per meter on the fly
        df = df.sort_values(["meter_id", "timestamp"])
        df["rolling_7d_avg"] = (
            df.groupby("meter_id")["consumption"]
            .transform(lambda s: s.rolling(7 * 24, min_periods=6).mean())
        )
        cols.append("rolling_7d_avg")

    out = df[cols].copy()
    out["timestamp"] = out.timestamp.dt.strftime("%Y-%m-%d %H:%M")
    return out.replace({np.nan: None}).to_dict("records")


@app.get("/api/meters")
def meters(dataset_id: int):
    df = rows_for(dataset_id)
    if df.empty:
        return []
    return (
        df.groupby("meter_id")
        .agg(
            consumption=("consumption", "sum"),
            average=("consumption", "mean"),
            anomalies=("anomaly", lambda s: int((s == -1).sum())),
            high_risk=("risk_score", lambda s: int((s >= 60).sum())),
        )
        .reset_index()
        .sort_values("consumption", ascending=False)
        .to_dict("records")
    )


@app.get("/api/meters/{meter_id}")
def meter(meter_id: str, dataset_id: int):
    df = rows_for(dataset_id)
    df = df[df.meter_id == meter_id]
    if df.empty:
        raise HTTPException(404, "Meter not found")
    return {
        "meter_id":    meter_id,
        "records":     int(len(df)),
        "consumption": round(float(df.consumption.sum()), 2),
        "average":     round(float(df.consumption.mean()), 3),
        "anomalies":   int((df.anomaly == -1).sum()),
        "high_risk":   int((df.risk_score >= 60).sum()),
        "trend":       df[["timestamp", "consumption", "expected", "risk_score", "anomaly"]].tail(500).replace({np.nan: None}).to_dict("records"),
    }


@app.get("/api/insights/{analysis_id}")
def insights(analysis_id: int):
    conn = get_conn()
    a = conn.execute("SELECT * FROM analysis_runs WHERE id=?", (analysis_id,)).fetchone()
    conn.close()
    if not a:
        raise HTTPException(404, "Analysis not found")
    df = rows_for(a["dataset_id"])
    out = []
    if df.empty:
        return out
    meter_an = df.groupby("meter_id").anomaly.apply(lambda s: int((s == -1).sum())).sort_values(ascending=False)
    if meter_an.iloc[0] > 0:
        out.append({
            "title":    "Repeated anomalies need review",
            "evidence": f"{meter_an.index[0]} has {meter_an.iloc[0]} flagged readings.",
            "severity": "High" if meter_an.iloc[0] >= 5 else "Medium",
            "action":   "Compare the flagged periods with operating schedules and meter history.",
        })
    hourly = df.groupby(df.timestamp.dt.hour).consumption.mean()
    h = int(hourly.idxmax())
    out.append({
        "title":    "Peak consumption window",
        "evidence": f"Average consumption is highest around {h:02d}:00.",
        "severity": "Info",
        "action":   "Review scheduled loads and expected operating activity around this window.",
    })
    mean_risk = df.risk_score.mean()
    if mean_risk >= 40:
        out.append({
            "title":    "Variability is elevated",
            "evidence": f"Mean screening risk is {mean_risk:.1f}/100.",
            "severity": "Medium",
            "action":   "Prioritize repeated patterns instead of isolated readings.",
        })
    else:
        out.append({
            "title":    "No broad elevated-risk pattern",
            "evidence": f"Mean screening risk is {mean_risk:.1f}/100.",
            "severity": "Low",
            "action":   "Continue monitoring and investigate only material deviations.",
        })
    return out


@app.get("/api/alerts")
def alerts(analysis_id: int):
    conn = get_conn()
    rs = conn.execute(
        """SELECT a.*, r.timestamp,r.meter_id,r.consumption,r.expected,r.deviation_pct,r.risk_score,r.risk_level,r.explanation
           FROM alerts a
           JOIN records r ON substr(r.timestamp,1,19)=substr(a.record_key,1,19)
                         AND r.meter_id=substr(a.record_key,instr(a.record_key,'|')+1)
           JOIN analysis_runs ar ON ar.id=a.analysis_id
           WHERE a.analysis_id=? ORDER BY r.risk_score DESC""",
        (analysis_id,),
    ).fetchall()
    conn.close()
    return [dict(r) for r in rs]


@app.patch("/api/alerts/{alert_id}")
def patch_alert(alert_id: int, p: AlertPatch):
    if p.status and p.status not in {"Open", "Investigating", "Resolved"}:
        raise HTTPException(400, "Status must be Open, Investigating, or Resolved.")
    conn = get_conn()
    row = conn.execute("SELECT id FROM alerts WHERE id=?", (alert_id,)).fetchone()
    if not row:
        conn.close()
        raise HTTPException(404, "Alert not found")
    fields: list[str] = []
    vals: list = []
    if p.status is not None:
        fields.append("status=?"); vals.append(p.status)
    if p.notes is not None:
        fields.append("notes=?"); vals.append(p.notes)
    fields.append("updated_at=?"); vals.append(now()); vals.append(alert_id)
    conn.execute(f"UPDATE alerts SET {','.join(fields)} WHERE id=?", vals)
    conn.commit(); conn.close()
    return {"ok": True}


@app.get("/api/reports/{analysis_id}/csv")
def report_csv(analysis_id: int):
    conn = get_conn()
    a = conn.execute("SELECT * FROM analysis_runs WHERE id=?", (analysis_id,)).fetchone()
    conn.close()
    if not a:
        raise HTTPException(404, "Analysis not found")
    df = rows_for(a["dataset_id"])
    buf = io.StringIO()
    df.to_csv(buf, index=False)
    return StreamingResponse(
        iter([buf.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename=wattwatch_analysis_{analysis_id}.csv"},
    )


@app.get("/api/reports/{analysis_id}/print", response_class=HTMLResponse)
def printable_report(
    analysis_id: int,
    simple:  bool  = False,
    tariff:  float = Query(8.0, ge=0.0),
):
    conn = get_conn()
    a = conn.execute("SELECT * FROM analysis_runs WHERE id=?", (analysis_id,)).fetchone()
    conn.close()
    if not a:
        raise HTTPException(404, "Analysis not found")
    df   = rows_for(a["dataset_id"])
    s    = summary_from(df, a)
    meta = json.loads(a["model_metadata_json"] or "{}")
    ds   = dataset_row(a["dataset_id"])

    if simple:
        return HTMLResponse(render_wattwatch_report(df, s, ds, meta, tariff=tariff))

    # Legacy verbose report (kept for backward compat)
    rows_html = "".join(
        f"<tr><td>{r.timestamp}</td><td>{r.meter_id}</td>"
        f"<td>{r.consumption:.2f}</td>"
        f"<td>{'' if pd.isna(r.expected) else f'{r.expected:.2f}'}</td>"
        f"<td>{r.risk_level}</td></tr>"
        for r in df[df.anomaly == -1].sort_values("risk_score", ascending=False).head(15).itertuples()
    )
    return HTMLResponse(
        f"""<!doctype html><html><head><title>WattWatch Report</title>
        <style>body{{font-family:Arial;color:#1b251e;padding:40px}}
        h1{{margin-bottom:4px}}.muted{{color:#66736a}}
        .grid{{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin:24px 0}}
        .k{{border:1px solid #ccd7ce;padding:15px;border-radius:10px}}
        table{{width:100%;border-collapse:collapse}}th,td{{padding:8px;border-bottom:1px solid #ddd;text-align:left}}
        @media print{{button{{display:none}}}}</style></head>
        <body><button onclick="window.print()">Print / Save as PDF</button>
        <h1>WattWatch</h1><p class="muted">Electricity Usage Report</p>
        <p>Dataset: {ds['name']} {'• SYNTHETIC DEMO DATA' if ds['is_demo'] else ''}</p>
        <p>Analysis date: {a['created_at']}</p>
        <div class="grid">
          <div class="k"><b>Total energy</b><br>{s['total_energy_kwh']} kWh</div>
          <div class="k"><b>Records</b><br>{s['records']}</div>
          <div class="k"><b>Anomalies</b><br>{s['anomalies']}</div>
          <div class="k"><b>High risk</b><br>{s['high_risk']}</div>
        </div>
        <h2>Flagged records</h2>
        <table><thead><tr><th>Timestamp</th><th>Meter</th><th>Observed kWh</th><th>Expected</th><th>Risk</th></tr></thead>
        <tbody>{rows_html}</tbody></table>
        <h2>Limitations</h2>
        <p>An anomaly does not prove electricity theft, energy loss, or wastage. Investigation should consider data quality, operating schedules, equipment behavior, and physical verification.</p>
        </body></html>"""
    )


# ── Serve the compiled Vite frontend when a production build is present ───────
from fastapi.staticfiles import StaticFiles

FRONTEND_DIST = ROOT.parent / "frontend" / "dist"
if FRONTEND_DIST.exists():
    app.mount("/", StaticFiles(directory=FRONTEND_DIST, html=True), name="frontend")
