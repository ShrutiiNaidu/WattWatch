from pathlib import Path
import sqlite3

DB_PATH = Path(__file__).resolve().parents[1] / 'energywise.db'

def get_conn():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    conn = get_conn()
    conn.executescript('''
    CREATE TABLE IF NOT EXISTS datasets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      source TEXT NOT NULL,
      is_demo INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      records INTEGER NOT NULL DEFAULT 0,
      valid_records INTEGER NOT NULL DEFAULT 0,
      invalid_records INTEGER NOT NULL DEFAULT 0,
      warnings_json TEXT DEFAULT '[]'
    );
    CREATE TABLE IF NOT EXISTS analysis_runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      dataset_id INTEGER NOT NULL,
      algorithm TEXT NOT NULL,
      sensitivity REAL NOT NULL,
      created_at TEXT NOT NULL,
      records_analyzed INTEGER NOT NULL,
      anomalies INTEGER NOT NULL,
      high_risk INTEGER NOT NULL,
      model_metadata_json TEXT DEFAULT '{}',
      FOREIGN KEY(dataset_id) REFERENCES datasets(id)
    );
    CREATE TABLE IF NOT EXISTS alerts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      analysis_id INTEGER NOT NULL,
      record_key TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'Open',
      notes TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL,
      UNIQUE(analysis_id, record_key),
      FOREIGN KEY(analysis_id) REFERENCES analysis_runs(id)
    );
    CREATE TABLE IF NOT EXISTS records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      dataset_id INTEGER NOT NULL,
      timestamp TEXT NOT NULL,
      meter_id TEXT NOT NULL,
      building_id TEXT,
      consumption REAL NOT NULL,
      expected REAL,
      deviation REAL,
      deviation_pct REAL,
      anomaly INTEGER NOT NULL DEFAULT 0,
      anomaly_score REAL,
      risk_score REAL,
      risk_level TEXT,
      explanation TEXT,
      FOREIGN KEY(dataset_id) REFERENCES datasets(id)
    );
    CREATE INDEX IF NOT EXISTS idx_records_dataset_ts ON records(dataset_id, timestamp);
    CREATE INDEX IF NOT EXISTS idx_records_analysis ON alerts(analysis_id);
    ''')
    conn.commit(); conn.close()
