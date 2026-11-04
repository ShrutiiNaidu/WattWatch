import React, { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import type { Anomaly, AnomalyTag, TrendPoint } from '../types';
import { BRAND } from '../config/brand';
import {
  Area, AreaChart, CartesianGrid, ResponsiveContainer,
  Tooltip, XAxis, YAxis, ReferenceLine,
} from 'recharts';

const fmt = (n: number | null | undefined, d = 1) =>
  n == null ? '—' : Number(n).toLocaleString('en-IN', { maximumFractionDigits: d });

const PRESET_TAGS: AnomalyTag[] = [
  'Heavy AC usage',
  'Washing Machine / Geyser',
  'Guests Over',
  'EV Charging',
];

interface Props {
  anomaly: Anomaly | null;
  trend: TrendPoint[];
  tariff: number;
  existingTag: AnomalyTag | null;
  onClose: () => void;
  onTagChange: (anomalyId: number, tag: AnomalyTag | null) => void;
}

function severityLabel(level?: string) {
  if (level?.includes('High')) return { text: 'Needs attention', cls: 'high' };
  if (level?.includes('Medium')) return { text: 'Worth checking', cls: 'medium' };
  return { text: 'Low concern', cls: 'low' };
}

export function DrillDownModal({ anomaly, trend, tariff, existingTag, onClose, onTagChange }: Props) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!anomaly) return;
    // Focus the close button when modal opens
    setTimeout(() => closeRef.current?.focus(), 50);

    // Focus trap
    const trap = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { onClose(); return; }
      if (e.key !== 'Tab') return;
      const focusable = dialogRef.current?.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      );
      if (!focusable || focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey) {
        if (document.activeElement === first) { e.preventDefault(); last.focus(); }
      } else {
        if (document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener('keydown', trap);
    return () => document.removeEventListener('keydown', trap);
  }, [anomaly, onClose]);

  if (!anomaly) return null;

  // Build day-hourly chart from trend: same meter, same day
  const anomalyDate = new Date(anomaly.timestamp);
  const anomalyHour = anomalyDate.getHours();

  const dayData = trend
    .filter(p => {
      const d = new Date(p.timestamp);
      return (
        p.meter_id === anomaly.meter_id &&
        d.getFullYear() === anomalyDate.getFullYear() &&
        d.getMonth() === anomalyDate.getMonth() &&
        d.getDate() === anomalyDate.getDate()
      );
    })
    .map(p => ({
      hour: new Date(p.timestamp).getHours(),
      actual: p.consumption,
      usual: p.expected ?? p.rolling_7d_avg ?? null,
      isAnomaly: p.anomaly === -1,
    }))
    .sort((a, b) => a.hour - b.hour);

  const excessKwh = anomaly.excess_kwh ?? (
    anomaly.expected != null ? Math.max(0, anomaly.consumption - anomaly.expected) : null
  );
  const estCost = excessKwh != null ? excessKwh * tariff : null;
  const sev = severityLabel(anomaly.risk_level);
  const friendlyTs = anomalyDate.toLocaleString('en-IN', {
    weekday: 'short', day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });

  return (
    <div className="modalOverlay" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div
        ref={dialogRef}
        className="modalDialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
      >
        {/* Header */}
        <div className="modalHeader">
          <div>
            <div className="eyebrow">READING DETAIL</div>
            <h2 id="modal-title" className="modalTitle">{friendlyTs}</h2>
            <span className="modalMeter">{anomaly.meter_id}</span>
          </div>
          <button ref={closeRef} className="modalClose" onClick={onClose} aria-label="Close details">
            <X size={20} />
          </button>
        </div>

        {/* Severity + cost badges */}
        <div className="modalBadges">
          <span className={`severityBadge ${sev.cls}`}>{sev.text}</span>
          {excessKwh != null && excessKwh > 0.01 && (
            <span className="costBadge">
              +{fmt(excessKwh, 2)} kWh extra
              {estCost != null && <> · ~{BRAND.CURRENCY_SYMBOL}{fmt(estCost, 0)} more</>}
            </span>
          )}
        </div>

        {/* Stats row */}
        <div className="modalStats">
          <div>
            <span>Actual</span>
            <strong>{fmt(anomaly.consumption, 2)} units</strong>
          </div>
          <div>
            <span>Usual</span>
            <strong>{fmt(anomaly.expected, 2)} units</strong>
          </div>
          {anomaly.deviation_pct != null && (
            <div>
              <span>Difference</span>
              <strong>{fmt(Math.abs(anomaly.deviation_pct), 0)}%</strong>
            </div>
          )}
        </div>

        {/* Hourly drill-down chart */}
        {dayData.length > 0 && (
          <div className="modalChart" aria-label="Hourly electricity use for this day compared with usual">
            <div className="chartTitle">
              <b>This day, hour by hour</b>
              <span>Actual vs usual · units = kWh</span>
            </div>
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={dayData}>
                <CartesianGrid stroke="#ddd7ca" strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="hour" tickFormatter={h => `${h}:00`} tick={{ fontSize: 11 }} />
                <YAxis hide />
                <Tooltip
                  contentStyle={{ background: '#fffdf8', border: '1px solid #d9d2c3', borderRadius: 8 }}
                  formatter={(v: number, n: string) => [`${fmt(v, 2)} units`, n === 'actual' ? 'Actual' : 'Usual']}
                  labelFormatter={(h: number) => `${h}:00`}
                />
                <Area type="monotone" dataKey="usual" stroke="#7a8d72" fill="#7a8d72" fillOpacity={0.1} strokeWidth={2} dot={false} />
                <Area type="monotone" dataKey="actual" stroke="#c87941" fill="#c87941" fillOpacity={0.12} strokeWidth={2.5} dot={false} />
                <ReferenceLine x={anomalyHour} stroke="#c87941" strokeDasharray="4 3" label={{ value: '⬆ spike', position: 'top', fill: '#c87941', fontSize: 11 }} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Tagging */}
        <div className="modalSection">
          <h3 className="modalSectionTitle">What caused this?</h3>
          {existingTag ? (
            <div className="modalTagged">
              <span className="explainedBadge">Explained: {existingTag}</span>
              <button className="tagRemoveBtn" onClick={() => onTagChange(anomaly.id, null)}>
                Remove tag
              </button>
            </div>
          ) : (
            <div className="modalTagGrid">
              {PRESET_TAGS.map(t => (
                <button key={t} className="tagOption" onClick={() => onTagChange(anomaly.id, t)}>
                  {t}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Saving suggestion */}
        <div className="modalSuggestion">
          <b>Tip:</b>{' '}
          {(() => {
            const h = anomalyHour;
            if (h >= 0 && h < 5) return 'This late-night spike may be from always-on devices — check set-top boxes, old fridges, or chargers left plugged in.';
            if (h >= 5 && h < 10) return 'Morning spikes often come from geysers and cooking. Consider a timer or solar water heater.';
            if (h >= 10 && h < 16) return 'Afternoon spikes are often from air conditioning. Raising the set-point by 1–2°C can help.';
            if (h >= 16 && h < 21) return 'Evening spikes are common from routines — laundry, cooking, AC. Shifting some of these off-peak saves money.';
            return 'Night-time spikes can come from EV charging or late appliance use. Off-peak charging is cheaper.';
          })()}
        </div>

        <button className="primaryBtn modalDone" onClick={onClose}>
          Done
        </button>
      </div>
    </div>
  );
}
