"""
WattWatch — ML module.

Anomaly detection using Isolation Forest (primary) and a rolling
statistical baseline (fallback). Time-of-day aware feature engineering
is delegated to the preprocessing module.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np
import pandas as pd
from sklearn.ensemble import IsolationForest

from .preprocessing import (
    add_time_features,
    classify_severity,
    validate_frame,   # re-exported for backward compat
)

__all__ = ["AnalysisResult", "analyze", "validate_frame"]


@dataclass
class AnalysisResult:
    frame: pd.DataFrame
    metadata: dict


# Feature set used by the Isolation Forest — order matters for reproducibility
_FEATURES = [
    "consumption",
    "hour_sin", "hour_cos",   # cyclic hour-of-day
    "dow_sin",  "dow_cos",    # cyclic day-of-week
    "weekend",
    "rolling_mean",
    "rolling_std",
    "deviation_pct",
    "change_pct",
    "deviation_from_hourly",  # deviation vs the same-hour historical mean
]


def analyze(df: pd.DataFrame, algorithm: str = "isolation_forest", sensitivity: float = 0.01) -> AnalysisResult:
    """
    Run anomaly detection on a dataset.

    Parameters
    ----------
    df : DataFrame with columns timestamp, meter_id, building_id, consumption.
    algorithm : 'isolation_forest' (default) or 'statistical'.
    sensitivity : contamination fraction for Isolation Forest (0.005–0.20).

    Returns
    -------
    AnalysisResult with the enriched frame and a metadata dict.
    """
    x = add_time_features(df)

    usable = x.dropna(subset=["consumption"]).copy()
    if len(usable) < 20:
        raise ValueError("At least 20 valid observations are required for anomaly analysis.")

    X = usable[_FEATURES].replace([np.inf, -np.inf], np.nan).fillna(0)

    # ── Model ────────────────────────────────────────────────────────────────
    if algorithm == "statistical":
        z = (X["consumption"] - X["rolling_mean"]) / X["rolling_std"].replace(0, np.nan)
        z = z.replace([np.inf, -np.inf], 0).fillna(0)
        labels = (z.abs() >= 3).astype(int).replace({0: 1, 1: -1})
        raw_score = z.abs().clip(0, 8) / 8
        model_name = "Rolling statistical baseline (|z| ≥ 3)"
    else:
        contamination = float(np.clip(sensitivity, 0.005, 0.20))
        model = IsolationForest(
            n_estimators=200,
            contamination=contamination,
            random_state=42,
            n_jobs=-1,
        )
        model.fit(X)
        labels = model.predict(X)
        raw_score = -model.score_samples(X)
        q1, q99 = np.quantile(raw_score, [0.01, 0.99])
        raw_score = np.clip((raw_score - q1) / (q99 - q1 + 1e-9), 0, 1)
        model_name = "Isolation Forest (time-of-day aware)"

    usable["anomaly"]       = labels
    usable["anomaly_score"] = raw_score

    # ── Risk score ───────────────────────────────────────────────────────────
    dev      = np.clip(usable["deviation_pct"].abs().fillna(0) / 100, 0, 1)
    magnitude = np.clip(
        usable["deviation"].abs() / (usable["rolling_mean"].abs().replace(0, np.nan) * 1.5),
        0, 1,
    ).fillna(0)
    repeat   = (
        usable.groupby("meter_id")["anomaly"]
        .transform(lambda s: s.eq(-1).rolling(6, min_periods=1).sum() / 6)
        .clip(0, 1)
    )
    quality_factor = np.where(usable["expected"].notna(), 1.0, 0.5)
    risk = (
        100 * (0.40 * usable["anomaly_score"] + 0.25 * dev + 0.20 * magnitude + 0.15 * repeat)
        * quality_factor
    ).clip(0, 100).round(1)

    usable["risk_score"] = risk
    usable["risk_level"] = pd.cut(
        risk, [-1, 30, 60, 100], labels=["Low Risk", "Medium Risk", "High Risk"]
    ).astype(str)

    # ── Severity tier (plain-language, from preprocessing thresholds) ─────
    usable["severity"] = usable.apply(
        lambda r: classify_severity(r.get("deviation_pct"), r.get("risk_score")),
        axis=1,
    )

    usable["explanation"] = usable.apply(_explain, axis=1)

    # Reattach rows that were excluded from modelling (NaN consumption etc.)
    x = x.drop(
        columns=["anomaly", "anomaly_score", "risk_score", "risk_level", "severity", "explanation"],
        errors="ignore",
    )
    x = x.merge(
        usable[["timestamp", "meter_id", "anomaly", "anomaly_score", "risk_score", "risk_level", "severity", "explanation"]],
        on=["timestamp", "meter_id"],
        how="left",
    )
    x["anomaly"] = x["anomaly"].fillna(0).astype(int)

    metadata = {
        "algorithm":    algorithm,
        "model_name":   model_name,
        "sensitivity":  float(sensitivity),
        "features":     _FEATURES,
        "records_analyzed": len(usable),
        "notes": (
            "Scores are screening signals, not calibrated probabilities "
            "or proof of theft/wastage. Time-of-day aware features (sin/cos "
            "cyclic encoding + hourly baseline) reduce false positives from "
            "expected daily peaks."
        ),
    }
    return AnalysisResult(x, metadata)


def _explain(r: pd.Series) -> str:
    parts: list[str] = []
    if r.get("anomaly") == -1:
        parts.append("unusual pattern detected")
    dev_pct = r.get("deviation_pct")
    if dev_pct is not None and pd.notna(dev_pct) and abs(dev_pct) >= 30:
        parts.append(f"{abs(dev_pct):.0f}% deviation from available baseline")
    risk = r.get("risk_score")
    if risk is not None and pd.notna(risk) and risk >= 60:
        parts.append("priority for review")
    if not parts:
        parts.append("within expected variation")
    return "; ".join(parts)
