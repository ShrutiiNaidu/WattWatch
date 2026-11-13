import sqlite3

import pandas as pd

from backend.app import db
from backend.app.reports import render_simple_report


def test_fastapi_app_imports_report_renderer():
    from backend.app.main import app

    assert app.title == "WattWatch"
    assert callable(render_simple_report)


def test_report_uses_selected_tariff():
    report = render_simple_report(
        pd.DataFrame(columns=["meter_id", "consumption", "expected", "anomaly", "risk_score"]),
        {
            "high_risk": 0,
            "anomalies": 0,
            "total_energy_kwh": 0,
            "records": 0,
            "estimated_excess_kwh": 8,
        },
        {"is_demo": False, "name": "Test", "records": 0, "valid_records": 0},
        {},
        tariff=2,
    )

    assert "₹16.00" in report
    assert "₹2.00 per kWh" in report


def test_init_db_migrates_legacy_records_table(tmp_path, monkeypatch):
    database_path = tmp_path / "legacy.db"
    with sqlite3.connect(database_path) as connection:
        connection.execute(
            "CREATE TABLE records (id INTEGER PRIMARY KEY, dataset_id INTEGER, timestamp TEXT)"
        )

    monkeypatch.setattr(db, "DB_PATH", database_path)
    db.init_db()

    connection = db.get_conn()
    try:
        columns = {row["name"] for row in connection.execute("PRAGMA table_info(records)")}
    finally:
        connection.close()

    assert "severity" in columns
