"""
WattWatch — preprocessing module.

Responsible for:
  - Column normalisation (flexible header detection)
  - Validation: blocking errors + soft warnings
  - Cyclic time encoding (sin/cos for hour, day-of-week)
  - Per-hour-of-day rolling baseline computation

All thresholds and constants are defined at the top of this module.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

import numpy as np
import pandas as pd

# ─── Constants / thresholds ────────────────────────────────────────────────────

#: Maximum kWh gap (time-weighted) before we flag a gap warning
LARGE_GAP_HOURS: float = 2.0

#: Number of prior same-hour observations to compute an hourly rolling baseline
HOURLY_BASELINE_WINDOW: int = 7 * 24  # 7 days × 24 hours

#: Severity thresholds — deviation_pct and risk_score drive the tier
SEVERITY_THRESHOLDS: dict[str, tuple[float, float]] = {
    "High":   (60.0, 60.0),   # deviation_pct ≥ 60  OR  risk_score ≥ 60
    "Medium": (30.0, 30.0),   # deviation_pct ≥ 30  OR  risk_score ≥ 30
    "Low":    (0.0,  0.0),    # everything else
}

#: Candidate column names (lower-case) for auto-detection
_TS_CANDIDATES = ["timestamp", "datetime", "date_time", "date"]
_CONS_CANDIDATES = ["consumption", "energy_kwh", "energy", "kwh",
                    "global_active_power", "power", "active_power"]
_METER_CANDIDATES = ["meter_id", "meter", "meterid", "device_id"]
_BLDG_CANDIDATES = ["building_id", "building", "site_id", "site"]


# ─── Data classes ──────────────────────────────────────────────────────────────

@dataclass
class QualityIssue:
    type: str
    count: int
    message: str
    rows: list[int] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return {
            "type": self.type,
            "count": self.count,
            "message": self.message,
            "rows": self.rows[:10],  # send at most 10 example row numbers
        }


@dataclass
class QualityWarning:
    type: str
    count: int
    message: str

    def to_dict(self) -> dict[str, Any]:
        return {"type": self.type, "count": self.count, "message": self.message}


@dataclass
class ValidationResult:
    clean: pd.DataFrame
    mapping: dict[str, str | None]
    issues: list[QualityIssue]
    warnings: list[QualityWarning]
    invalid_mask: pd.Series   # boolean — True where row is bad/excluded

    @property
    def blocking(self) -> bool:
        return any(i.count > 0 for i in self.issues)

    def issues_as_dicts(self) -> list[dict]:
        return [i.to_dict() for i in self.issues]

    def warnings_as_dicts(self) -> list[dict]:
        return [w.to_dict() for w in self.warnings]


# ─── Column normalisation ──────────────────────────────────────────────────────

def _pick(lower_map: dict[str, str], candidates: list[str]) -> str | None:
    for name in candidates:
        if name in lower_map:
            return lower_map[name]
    return None


def normalize_columns(raw: pd.DataFrame) -> tuple[pd.DataFrame, dict[str, str | None]]:
    """
    Detect timestamp, consumption, meter and building columns by fuzzy name match.
    Returns a normalised DataFrame and a column-mapping dict.
    Raises ValueError if required columns are missing.
    """
    lower_map = {c.lower().strip(): c for c in raw.columns}
    ts_col   = _pick(lower_map, _TS_CANDIDATES)
    cons_col = _pick(lower_map, _CONS_CANDIDATES)
    meter_col = _pick(lower_map, _METER_CANDIDATES)
    bldg_col  = _pick(lower_map, _BLDG_CANDIDATES)

    if not ts_col or not cons_col:
        missing = []
        if not ts_col:   missing.append("timestamp/date")
        if not cons_col: missing.append("consumption/energy")
        raise ValueError(
            f"A timestamp/date column and a consumption/energy column are required. "
            f"Missing: {', '.join(missing)}."
        )

    out = pd.DataFrame()
    out["timestamp"]   = pd.to_datetime(raw[ts_col],   errors="coerce")
    out["consumption"] = pd.to_numeric(raw[cons_col],  errors="coerce")
    out["meter_id"]    = raw[meter_col].astype(str)    if meter_col else "METER-001"
    out["building_id"] = raw[bldg_col].astype(str)     if bldg_col  else None

    mapping = {
        "timestamp":   ts_col,
        "consumption": cons_col,
        "meter_id":    meter_col,
        "building_id": bldg_col,
        "original_columns": list(raw.columns),
    }
    return out, mapping


# ─── Main validation function ──────────────────────────────────────────────────

def validate_and_enrich(raw: pd.DataFrame) -> ValidationResult:
    """
    Full validation pipeline.  Returns a ValidationResult with:
      - clean DataFrame (all rows, flagged ones have NaN consumption)
      - issues  (blocking — row removed from analysis)
      - warnings (soft — analysis can proceed, user informed)
      - invalid_mask (True = row excluded from analysis)
    """
    out, mapping = normalize_columns(raw)
    issues: list[QualityIssue] = []
    warnings: list[QualityWarning] = []

    # ── 1. Missing timestamp ─────────────────────────────────────────────────
    bad_ts_mask = out["timestamp"].isna()
    bad_ts_rows = [i + 2 for i in bad_ts_mask[bad_ts_mask].index.tolist()]
    issues.append(QualityIssue(
        type="missing_timestamp",
        count=int(bad_ts_mask.sum()),
        message=f"{int(bad_ts_mask.sum())} reading(s) are missing a date or time (rows: {_row_sample(bad_ts_rows)}).",
        rows=bad_ts_rows,
    ))

    # ── 2. Non-numeric / missing consumption ─────────────────────────────────
    # Distinguish "was text" vs "was truly absent" by checking if the original
    # column had non-empty non-numeric strings.
    original_cons = raw.iloc[:, list(raw.columns).index(mapping["consumption"])].astype(str).str.strip()
    was_non_numeric = original_cons.isin(["", "nan", "NaN", "None"]) == False  # noqa: E712
    non_num_mask = out["consumption"].isna() & was_non_numeric
    miss_mask    = out["consumption"].isna() & ~non_num_mask

    if non_num_mask.sum():
        rows = [i + 2 for i in non_num_mask[non_num_mask].index.tolist()]
        issues.append(QualityIssue(
            type="non_numeric",
            count=int(non_num_mask.sum()),
            message=f"{int(non_num_mask.sum())} reading(s) have a non-numeric value in the electricity column (rows: {_row_sample(rows)}).",
            rows=rows,
        ))
    else:
        issues.append(QualityIssue(type="non_numeric", count=0,
                                   message="No non-numeric consumption values found."))

    miss_rows = [i + 2 for i in miss_mask[miss_mask].index.tolist()]
    issues.append(QualityIssue(
        type="missing_consumption",
        count=int(miss_mask.sum()),
        message=f"{int(miss_mask.sum())} reading(s) are missing an electricity-use value (rows: {_row_sample(miss_rows)}).",
        rows=miss_rows,
    ))

    # ── 3. Negative consumption ──────────────────────────────────────────────
    neg_mask = (out["consumption"] < 0).fillna(False)
    neg_rows = [i + 2 for i in neg_mask[neg_mask].index.tolist()]
    issues.append(QualityIssue(
        type="negative_consumption",
        count=int(neg_mask.sum()),
        message=f"{int(neg_mask.sum())} reading(s) have a negative electricity-use value (rows: {_row_sample(neg_rows)}).",
        rows=neg_rows,
    ))

    # ── 4. Duplicate timestamps per meter ────────────────────────────────────
    dup_mask = out.duplicated(subset=["timestamp", "meter_id"], keep="first") & ~bad_ts_mask
    dup_rows = [i + 2 for i in dup_mask[dup_mask].index.tolist()]
    issues.append(QualityIssue(
        type="duplicate_records",
        count=int(dup_mask.sum()),
        message=f"{int(dup_mask.sum())} reading(s) appear more than once for the same meter and time (rows: {_row_sample(dup_rows)}).",
        rows=dup_rows,
    ))

    # ── invalid mask = any blocking issue ────────────────────────────────────
    invalid_mask = bad_ts_mask | out["consumption"].isna() | neg_mask

    # ── 5. Large time gaps (soft warning, per meter) ─────────────────────────
    gap_warnings = _detect_large_gaps(out[~invalid_mask])
    warnings.extend(gap_warnings)

    return ValidationResult(
        clean=out,
        mapping=mapping,
        issues=issues,
        warnings=warnings,
        invalid_mask=invalid_mask,
    )


def _row_sample(rows: list[int], n: int = 5) -> str:
    """Return a compact string like '2, 5, 8…' for row numbers."""
    if not rows:
        return "none"
    sample = rows[:n]
    suffix = "…" if len(rows) > n else ""
    return ", ".join(str(r) for r in sample) + suffix


def _detect_large_gaps(clean: pd.DataFrame) -> list[QualityWarning]:
    warnings: list[QualityWarning] = []
    for meter_id, group in clean.groupby("meter_id"):
        sorted_ts = group["timestamp"].sort_values().dropna()
        if len(sorted_ts) < 2:
            continue
        diffs = sorted_ts.diff().dt.total_seconds() / 3600
        large = diffs[diffs > LARGE_GAP_HOURS]
        if len(large):
            warnings.append(QualityWarning(
                type="large_gap",
                count=int(len(large)),
                message=(
                    f"Meter {meter_id} has {len(large)} gap(s) longer than "
                    f"{LARGE_GAP_HOURS:.0f} hours between readings. "
                    f"Largest gap: {large.max():.1f} hours."
                ),
            ))
    return warnings


# ─── Feature engineering ──────────────────────────────────────────────────────

def add_time_features(df: pd.DataFrame) -> pd.DataFrame:
    """
    Add cyclic time-of-day and day-of-week features (sin/cos encoding)
    and per-hour-of-day rolling baseline.

    Input df must have columns: timestamp (datetime), meter_id, consumption.
    Returns df with new columns added in-place (copy returned).
    """
    df = df.copy().sort_values(["meter_id", "timestamp"]).reset_index(drop=True)

    hour = df["timestamp"].dt.hour
    dow  = df["timestamp"].dt.dayofweek

    df["hour"]     = hour
    df["dow"]      = dow
    df["weekend"]  = (dow >= 5).astype(int)

    # Cyclic encodings — prevents the model from seeing hour 23 and hour 0 as far apart
    df["hour_sin"] = np.sin(2 * np.pi * hour / 24)
    df["hour_cos"] = np.cos(2 * np.pi * hour / 24)
    df["dow_sin"]  = np.sin(2 * np.pi * dow  / 7)
    df["dow_cos"]  = np.cos(2 * np.pi * dow  / 7)

    # Rolling statistics for the whole meter (24-h window)
    df["rolling_mean"] = df.groupby("meter_id")["consumption"].transform(
        lambda s: s.rolling(24, min_periods=6).mean()
    )
    df["rolling_std"] = df.groupby("meter_id")["consumption"].transform(
        lambda s: s.rolling(24, min_periods=6).std()
    )

    # ── Hourly baseline: per meter × hour-of-day, using only prior obs ───────
    # Shift by 1 first (use_only_prior) then rolling over same-hour history.
    keys = ["meter_id", "hour"]
    df["hourly_baseline"] = (
        df.groupby(keys)["consumption"]
        .transform(lambda s: s.shift(1).rolling(HOURLY_BASELINE_WINDOW, min_periods=3).mean())
    )

    # Day-of-week-aware baseline (same meter + hour + dow)
    df["expected"] = (
        df.groupby(["meter_id", "hour", "dow"])["consumption"]
        .transform(lambda s: s.shift(1).rolling(8, min_periods=3).mean())
        .fillna(df["hourly_baseline"])
        .fillna(df["rolling_mean"])
    )

    df["deviation"]     = df["consumption"] - df["expected"]
    df["deviation_pct"] = np.where(
        df["expected"].abs() > 1e-9,
        df["deviation"] / df["expected"] * 100,
        np.nan,
    )
    df["change_pct"] = (
        df.groupby("meter_id")["consumption"]
        .pct_change()
        .replace([np.inf, -np.inf], np.nan)
        .clip(-10, 10)
        .fillna(0)
    )
    df["deviation_from_hourly"] = df["consumption"] - df["hourly_baseline"].fillna(df["rolling_mean"].fillna(0))

    # Rolling 7-day average for the trend endpoint
    df["rolling_7d_avg"] = df.groupby("meter_id")["consumption"].transform(
        lambda s: s.rolling(7 * 24, min_periods=6).mean()
    )

    return df


def classify_severity(deviation_pct: float | None, risk_score: float | None) -> str:
    """
    Assign a plain-language severity tier from deviation and risk score.
    Thresholds are defined in SEVERITY_THRESHOLDS.
    """
    dev  = abs(deviation_pct) if deviation_pct is not None else 0.0
    risk = risk_score         if risk_score    is not None else 0.0
    high_dev, high_risk     = SEVERITY_THRESHOLDS["High"]
    medium_dev, medium_risk = SEVERITY_THRESHOLDS["Medium"]
    if dev >= high_dev or risk >= high_risk:
        return "High"
    if dev >= medium_dev or risk >= medium_risk:
        return "Medium"
    return "Low"


# ─── Backward-compat shim for existing ml.py validate_frame call ──────────────

def validate_frame(raw: pd.DataFrame):
    """
    Legacy interface: matches the signature expected by the old ml.py callers.
    Returns (clean, mapping, issues_list_of_dicts, invalid_mask, warnings_list_of_str).
    """
    result = validate_and_enrich(raw)
    issues_dicts = result.issues_as_dicts()
    warn_strings = [w.message for w in result.warnings]
    return result.clean, result.mapping, issues_dicts, result.invalid_mask, warn_strings
