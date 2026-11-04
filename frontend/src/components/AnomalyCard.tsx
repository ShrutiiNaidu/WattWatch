import React, { useState, useEffect, useRef, useCallback } from 'react';
import type { Anomaly, AnomalyTag, TagMap } from '../types';
import { BRAND } from '../config/brand';

const PRESET_TAGS: AnomalyTag[] = [
  'Heavy AC usage',
  'Washing Machine / Geyser',
  'Guests Over',
  'EV Charging',
];

const INSIGHT_MAP: Record<string, string> = {
  'Heavy AC usage': 'Consider raising the AC set-point by 1–2°C or using a timer to reduce peak use.',
  'Washing Machine / Geyser': 'Running these appliances off-peak (before 9 AM or after 9 PM) can reduce costs.',
  'Guests Over': 'No action needed — guest visits naturally increase usage.',
  'EV Charging': 'Consider scheduling EV charging during off-peak hours (late night) to lower costs.',
};

function tagKey(analysisId: number, anomalyId: number) {
  return `${BRAND.TAG_STORAGE_PREFIX}:${analysisId}:${anomalyId}`;
}

interface Props {
  anomaly: Anomaly;
  analysisId: number;
  tariff: number;
  onOpenDrillDown: (anomaly: Anomaly) => void;
  onTagChange: (anomalyId: number, tag: AnomalyTag | null) => void;
  existingTag: AnomalyTag | null;
}

const fmt = (n: number | null | undefined, d = 1) =>
  n == null ? '—' : Number(n).toLocaleString('en-IN', { maximumFractionDigits: d });

function attentionLabel(level: string | undefined) {
  if (level?.includes('High')) return 'Needs attention';
  if (level?.includes('Medium')) return 'Worth checking';
  return 'Review';
}

function explainAnomaly(anomaly: Anomaly) {
  if (anomaly.expected == null || anomaly.deviation_pct == null) {
    return 'This reading differed from the usual pattern around a similar time.';
  }
  const direction = anomaly.deviation_pct >= 0 ? 'higher' : 'lower';
  return `Electricity use was about ${fmt(Math.abs(anomaly.deviation_pct), 0)}% ${direction} than usual around this time.`;
}

function severityClass(level: string | undefined) {
  if (level?.includes('High')) return 'high';
  if (level?.includes('Medium')) return 'medium';
  return 'low';
}

export function AnomalyCard({ anomaly, analysisId, tariff, onOpenDrillDown, onTagChange, existingTag }: Props) {
  const [showTagPicker, setShowTagPicker] = useState(false);
  const [customTag, setCustomTag] = useState('');
  const tagRef = useRef<HTMLDivElement>(null);
  const sc = severityClass(anomaly.risk_level);
  const isExplained = !!existingTag;

  const excessKwh = anomaly.excess_kwh ?? (
    anomaly.expected != null ? Math.max(0, anomaly.consumption - anomaly.expected) : null
  );
  const estCost = excessKwh != null ? excessKwh * tariff : null;

  // Close tag picker on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (tagRef.current && !tagRef.current.contains(e.target as Node)) {
        setShowTagPicker(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const applyTag = (tag: AnomalyTag) => {
    onTagChange(anomaly.id, tag);
    setShowTagPicker(false);
    setCustomTag('');
  };

  const removeTag = () => onTagChange(anomaly.id, null);

  const friendlyTs = new Date(anomaly.timestamp).toLocaleString('en-IN', {
    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
  });

  return (
    <div className={`finding ${isExplained ? 'finding--explained' : ''}`}>
      <div className={`findingMark ${sc}`} aria-hidden="true">!</div>

      <div className="findingBody">
        <div className="findingTop">
          <b>{friendlyTs}</b>
          <span>{anomaly.meter_id}</span>
          {isExplained && (
            <span className="explainedBadge">Explained: {existingTag}</span>
          )}
        </div>

        <p>
          {anomaly.explanation?.replaceAll('unusual pattern detected', 'Electricity use was unusually high')
            .replaceAll('deviation from available baseline', 'higher or lower than usual')
            .replaceAll('priority for review', 'This pattern may be worth checking')
            || explainAnomaly(anomaly)}
        </p>

        <div className="findingNumbers">
          <span>Used <b>{fmt(anomaly.consumption, 2)} units</b></span>
          <span>Usual <b>{fmt(anomaly.expected, 2)} units</b></span>
          {anomaly.deviation_pct != null && (
            <span>Difference <b>{fmt(Math.abs(anomaly.deviation_pct), 0)}%</b></span>
          )}
          {excessKwh != null && excessKwh > 0.01 && (
            <span className="costPill">
              Spike of +{fmt(excessKwh, 2)} kWh
              {estCost != null && <> ≈ ~{BRAND.CURRENCY_SYMBOL}{fmt(estCost, 0)} extra</>}
            </span>
          )}
        </div>

        {/* Insight tip when tagged */}
        {existingTag && INSIGHT_MAP[existingTag] && (
          <div className="findingInsight">{INSIGHT_MAP[existingTag]}</div>
        )}

        {/* Actions row */}
        <div className="findingActions">
          <button
            className="drillBtn"
            onClick={() => onOpenDrillDown(anomaly)}
            aria-label={`View details for reading at ${friendlyTs}`}
          >
            View details
          </button>

          {/* Tag picker */}
          <div className="tagPicker" ref={tagRef}>
            {isExplained ? (
              <button className="tagRemoveBtn" onClick={removeTag} aria-label="Remove explanation tag">
                Remove tag
              </button>
            ) : (
              <button
                className="tagTriggerBtn"
                onClick={() => setShowTagPicker(v => !v)}
                aria-expanded={showTagPicker}
                aria-haspopup="listbox"
                aria-label="Explain this reading"
              >
                Explain this reading ▾
              </button>
            )}

            {showTagPicker && !isExplained && (
              <div className="tagDropdown" role="listbox" aria-label="Choose a reason for this reading">
                {PRESET_TAGS.map(t => (
                  <button key={t} role="option" className="tagOption" onClick={() => applyTag(t)}>
                    {t}
                  </button>
                ))}
                <div className="tagCustom">
                  <input
                    type="text"
                    placeholder="Custom reason…"
                    value={customTag}
                    onChange={e => setCustomTag(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter' && customTag.trim()) applyTag(customTag.trim());
                    }}
                    aria-label="Enter a custom reason"
                  />
                  <button
                    className="tagApplyBtn"
                    disabled={!customTag.trim()}
                    onClick={() => { if (customTag.trim()) applyTag(customTag.trim()); }}
                  >
                    Apply
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <span className={`riskText ${sc}`} aria-label={`Severity: ${attentionLabel(anomaly.risk_level)}`}>
        {attentionLabel(anomaly.risk_level)}
      </span>
    </div>
  );
}
