/** Shared TypeScript types for WattWatch frontend. */

export type Dataset = {
  id: number;
  name: string;
  is_demo: boolean;
  created_at?: string;
  records?: number;
  valid_records?: number;
  invalid_records?: number;
};

export type Analysis = {
  id: number;
  dataset_id: number;
  algorithm?: string;
  sensitivity?: number;
  metadata?: Record<string, unknown>;
};

export type SeverityBreakdown = {
  Low: number;
  Medium: number;
  High: number;
};

export type Summary = {
  records: number;
  total_energy_kwh: number;
  average_daily_kwh: number;
  anomalies: number;
  high_risk: number;
  estimated_excess_kwh: number;
  meters: number;
  demo: boolean;
  /** Added in Phase 2 — may be absent on older analyses */
  total_excess_cost?: number;
  severity_breakdown?: SeverityBreakdown;
};

export type Anomaly = {
  id: number;
  timestamp: string;
  meter_id: string;
  consumption: number;
  expected: number | null;
  deviation_pct: number | null;
  risk_score: number;
  risk_level: string;
  explanation?: string;
  /** Phase 2 additions */
  severity?: 'Low' | 'Medium' | 'High';
  excess_kwh?: number | null;
  estimated_cost?: number | null;
  deviation_kwh?: number | null;
};

export type QualityIssue = {
  type: string;
  count: number;
  message?: string;
  rows?: number[];
};

export type QualityWarning = {
  type: string;
  count: number;
  message: string;
};

export type UploadQuality = {
  total: number;
  valid: number;
  invalid: number;
  issues: QualityIssue[];
  warnings: QualityWarning[] | string[];
  /** Phase 2 */
  blocking_errors?: QualityIssue[];
  can_proceed?: boolean;
};

export type TrendPoint = {
  timestamp: string;
  meter_id: string;
  consumption: number;
  expected: number | null;
  deviation_pct: number | null;
  anomaly: number;
  risk_score: number | null;
  /** Phase 2 */
  rolling_7d_avg?: number | null;
};

export type AppOperation = 'upload' | 'analysis' | 'sample' | null;

export type StatusLevel = 'insufficient' | 'normal' | 'unusual' | 'attention' | null;

/** Tags that users can apply to anomalies. */
export type AnomalyTag =
  | 'Heavy AC usage'
  | 'Washing Machine / Geyser'
  | 'Guests Over'
  | 'EV Charging'
  | string; // custom

export type TagMap = Record<string, AnomalyTag>;

/** Toast notification. */
export type ToastItem = {
  id: string;
  kind: 'error' | 'success' | 'info';
  message: string;
};
