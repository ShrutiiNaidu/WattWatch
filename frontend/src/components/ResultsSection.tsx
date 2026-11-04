import React, { useState } from 'react';
import {
  Area, AreaChart, CartesianGrid, ResponsiveContainer,
  Tooltip, XAxis, YAxis,
} from 'recharts';
import { AlertTriangle, CheckCircle2, Download, FileText, Info } from 'lucide-react';
import type { Analysis, Anomaly, AnomalyTag, Dataset, Summary, TagMap, TrendPoint } from '../types';
import { BRAND } from '../config/brand';
import { reportCsvUrl, reportPrintUrl } from '../api/client';
import { AnomalyCard } from './AnomalyCard';
import { DrillDownModal } from './DrillDownModal';
import { EmptyState } from './EmptyState';
import { InsightCard } from './InsightCard';
import { SkeletonAnomalyList, SkeletonChart, SkeletonStatCard } from './SkeletonCard';
import { TariffBar } from './TariffBar';

const fmt = (n: number | null | undefined, d = 1) =>
  n == null ? '—' : Number(n).toLocaleString('en-IN', { maximumFractionDigits: d });

type StatusLevel = 'insufficient' | 'normal' | 'unusual' | 'attention' | null;

function deriveStatus(summary: Summary | null, trend: TrendPoint[]): StatusLevel {
  if (!summary) return null;
  if (summary.records === 0 || (trend.length > 0 && trend.every(r => r.expected == null))) return 'insufficient';
  if (summary.high_risk > 0) return 'attention';
  if (summary.anomalies > 0) return 'unusual';
  return 'normal';
}

interface Props {
  summary: Summary | null;
  trend: TrendPoint[];
  anomalies: Anomaly[];
  analysis: Analysis | null;
  dataset: Dataset | undefined;
  tariff: number;
  loading: boolean;
  tags: TagMap;
  onTariffChange: (v: number) => void;
  onTagChange: (anomalyId: number, tag: AnomalyTag | null) => void;
}

export function ResultsSection({
  summary, trend, anomalies, analysis, dataset,
  tariff, loading, tags, onTariffChange, onTagChange,
}: Props) {
  const [drillAnomaly, setDrillAnomaly] = useState<Anomaly | null>(null);
  const demo = dataset?.is_demo;
  const status = deriveStatus(summary, trend);
  const unusualPct = summary ? Math.round((summary.anomalies / Math.max(summary.records, 1)) * 100) : 0;
  const highestFinding = anomalies[0];

  // Exclude explained anomalies from attention count and excess cost
  const unexplained = anomalies.filter(a => !tags[a.id]);
  const totalExcessCost = unexplained.reduce((acc, a) => {
    const excess = a.excess_kwh ?? (a.expected != null ? Math.max(0, a.consumption - a.expected) : 0);
    return acc + excess * tariff;
  }, 0);

  if (loading) {
    return (
      <section id="check-results" className="resultsSection section" aria-busy="true">
        <div className="sectionHeading resultHead">
          <div>
            <div className="eyebrow">02 · YOUR RESULT</div>
            <h2>Checking your data…</h2>
          </div>
        </div>
        <div className="resultGrid">
          <div className="resultMain card">
            <div className="simpleStats">
              {[0, 1, 2, 3].map(i => <SkeletonStatCard key={i} />)}
            </div>
            <SkeletonChart />
          </div>
        </div>
        <SkeletonAnomalyList />
      </section>
    );
  }

  if (!summary) {
    return (
      <section id="check-results" className="resultsSection section">
        <EmptyState variant="noFile" />
      </section>
    );
  }

  return (
    <section id="check-results" className="resultsSection section">
      {/* Modal */}
      <DrillDownModal
        anomaly={drillAnomaly}
        trend={trend}
        tariff={tariff}
        existingTag={drillAnomaly ? (tags[drillAnomaly.id] ?? null) : null}
        onClose={() => setDrillAnomaly(null)}
        onTagChange={(id, tag) => { onTagChange(id, tag); }}
      />

      <div className="sectionHeading resultHead">
        <div>
          <div className="eyebrow">
            02 · YOUR RESULT{' '}
            {demo && <span className="demoBadge">DEMO DATA</span>}
          </div>
          <h2>Here's what we found.</h2>
          <p>
            We checked {fmt(summary.records, 0)} readings across {summary.meters} meter{summary.meters === 1 ? '' : 's'}.
          </p>
        </div>
        <div className={`statusPill ${status}`} role="status">
          <span aria-hidden="true" />
          {status === 'insufficient' ? 'Not enough information'
            : status === 'normal' ? 'Looks mostly normal'
              : status === 'unusual' ? 'Some unusual readings'
                : 'A few readings need attention'}
        </div>
      </div>

      {/* Tariff bar */}
      <TariffBar tariff={tariff} onChange={onTariffChange} />

      <div className="resultGrid">
        <div className="resultMain card">
          <div className="bigStatus">
            <div className={`statusIcon ${status}`} aria-hidden="true">
              {status === 'normal' ? <CheckCircle2 /> : <AlertTriangle />}
            </div>
            <div>
              <h3>
                {status === 'insufficient' ? 'We need more usual readings to compare.'
                  : status === 'normal' ? 'Your electricity use looks mostly normal.'
                    : status === 'unusual' ? 'We found some unusual usage.'
                      : 'Some readings are worth checking.'}
              </h3>
              <p>
                {status === 'insufficient'
                  ? 'There is not enough past information to compare these readings confidently.'
                  : summary.anomalies === 0
                    ? 'Nothing stood out as unusual in the readings we checked.'
                    : `We found ${unexplained.length} reading${unexplained.length === 1 ? '' : 's'} that need attention (${unusualPct}% of the data). An unusual reading does not by itself show what caused it.`}
              </p>
            </div>
          </div>

          <div className="simpleStats">
            <div>
              <strong>{fmt(summary.records, 0)}</strong>
              <span>Readings checked</span>
            </div>
            <div>
              <strong>{fmt(unexplained.length, 0)}</strong>
              <span>Need attention</span>
            </div>
            <div>
              <strong>
                {status === 'insufficient' ? 'Not enough data'
                  : status === 'attention' ? 'Needs attention'
                    : status === 'unusual' ? 'Worth checking'
                      : 'Normal'}
              </strong>
              <span>Attention level</span>
            </div>
            <div>
              <strong>
                {totalExcessCost > 0 ? `${BRAND.CURRENCY_SYMBOL}${fmt(totalExcessCost, 0)}` : '—'}
              </strong>
              <span>Est. extra cost</span>
            </div>
          </div>

          <div className="chartTitle">
            <b>Your electricity pattern</b>
            <span>Usual compared with actual · 1 unit = 1 kWh</span>
          </div>
          <div className="resultChart" aria-label="Line chart of actual vs usual electricity use">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={trend.slice(-45)}>
                <CartesianGrid stroke="#ddd7ca" strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="timestamp" hide />
                <YAxis hide />
                <Tooltip
                  contentStyle={{ background: '#fffdf8', border: '1px solid #d9d2c3', borderRadius: 10 }}
                  formatter={(v: number, n: string) => [`${fmt(v, 2)} units`, n === 'consumption' ? 'Actual' : 'Usual']}
                />
                <Area type="monotone" dataKey="expected" stroke="#7a8d72" fill="#7a8d72" fillOpacity={0.08} strokeWidth={2} dot={false} />
                <Area type="monotone" dataKey="consumption" stroke="#c87941" fill="#c87941" fillOpacity={0.09} strokeWidth={2.5} dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="sideStack">
          <div className="card explainCard">
            <div className="cardLabel">IN SIMPLE WORDS</div>
            <h3>What does "unusual" mean?</h3>
            <p>
              A reading is unusual when it differs from what this meter usually shows around a similar time.
            </p>
            <div className="rule">
              <span aria-hidden="true" />
              <b>It is a clue, not a conclusion.</b>
            </div>
          </div>
          <div className="card actionCard">
            <div className="cardLabel">WHAT YOU CAN DO</div>
            <ol>
              <li>
                {highestFinding
                  ? `Check what was running around ${new Date(highestFinding.timestamp).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })}.`
                  : 'Keep an eye on your usage over time.'}
              </li>
              <li>Compare the reading with your electricity bill or daily routine.</li>
              <li>If unusual readings keep happening, consider asking your electricity provider to check the meter.</li>
            </ol>
          </div>
        </div>
      </div>

      {/* Anomaly list */}
      <div className="findings card">
        <div className="findingsHead">
          <div>
            <div className="cardLabel">03 · WORTH A LOOK</div>
            <h3>Readings that stood out</h3>
          </div>
          <span>{fmt(summary.anomalies, 0)} found · {anomalies.length} shown · {anomalies.length - unexplained.length} explained</span>
        </div>

        {anomalies.length === 0 ? (
          <EmptyState variant="anomalies" />
        ) : (
          <div className="findingList">
            {anomalies.slice(0, 12).map((a, i) => (
              <AnomalyCard
                key={a.id ?? i}
                anomaly={a}
                analysisId={analysis?.id ?? 0}
                tariff={tariff}
                existingTag={tags[a.id] ?? null}
                onOpenDrillDown={setDrillAnomaly}
                onTagChange={onTagChange}
              />
            ))}
          </div>
        )}
      </div>

      {/* Insights */}
      {anomalies.length > 0 && (
        <InsightCard anomalies={anomalies} tags={tags} tariff={tariff} />
      )}

      {/* Report bar */}
      {analysis && (
        <div className="reportBar">
          <div>
            <FileText size={23} aria-hidden="true" />
            <div>
              <b>Download your report</b>
              <span>Save a clear summary of your results and unusual readings.</span>
            </div>
          </div>
          <div className="reportBtns">
            <a
              href={reportCsvUrl(analysis.id)}
              className="secondaryBtn"
              aria-label="Download data as CSV file"
            >
              <Download size={16} aria-hidden="true" /> Download data (CSV)
            </a>
            <a
              href={reportPrintUrl(analysis.id, tariff)}
              target="_blank"
              rel="noreferrer"
              className="primaryBtn"
              aria-label="Open printable report in a new tab"
            >
              <FileText size={16} aria-hidden="true" /> Print / Save as PDF
            </a>
          </div>
        </div>
      )}

      <details className="technicalDetails">
        <summary>Show technical details</summary>
        <div>
          <p><b>Checking method:</b> {(analysis?.metadata?.model_name as string) || analysis?.algorithm || 'Not available'}</p>
          <p><b>Readings checked:</b> {fmt((analysis?.metadata?.records_analyzed as number) ?? summary.records, 0)}</p>
          <p><b>About these results:</b> These are screening signals, not calibrated probabilities or proof of a fault, theft, or energy loss.</p>
        </div>
      </details>
    </section>
  );
}
