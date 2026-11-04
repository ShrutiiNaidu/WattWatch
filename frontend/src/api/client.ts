/** Typed API client for WattWatch. All backend calls go through here. */

import type { Analysis, Anomaly, Dataset, Summary, TrendPoint, UploadQuality } from '../types';

const API_BASE = '/api';

async function request<T>(path: string, opts: RequestInit = {}): Promise<T> {
  const res = await fetch(API_BASE + path, opts);
  if (!res.ok) {
    let message = await res.text();
    try {
      message = (JSON.parse(message) as { detail?: string }).detail ?? message;
    } catch {
      /* keep raw text */
    }
    throw new Error(message);
  }
  return res.json() as Promise<T>;
}

// ── Datasets ───────────────────────────────────────────────────────────────

export const fetchDatasets = () => request<Dataset[]>('/datasets');

export const fetchDataset = (id: number) =>
  request<Dataset & { analysis?: Analysis; warnings?: string[] }>(`/datasets/${id}`);

export const uploadCSV = (file: File) => {
  const fd = new FormData();
  fd.append('file', file);
  return request<{ dataset_id: number; name: string; mapping: Record<string, string>; quality: UploadQuality }>(
    '/datasets/upload',
    { method: 'POST', body: fd },
  );
};

export const loadSampleDataset = () =>
  request<{ dataset_id: number; demo: boolean; warnings: string[] }>('/datasets/sample/load', {
    method: 'POST',
  });

export const analyzeDataset = (datasetId: number) =>
  request<{ analysis_id: number }>(`/datasets/${datasetId}/analyze`, { method: 'POST' });

// ── Analysis ───────────────────────────────────────────────────────────────

export const fetchAnalysis = (id: number) => request<Analysis>(`/analysis/${id}`);

export const fetchSummary = (analysisId: number) =>
  request<Summary>(`/analysis/${analysisId}/summary`);

export const fetchTrend = (analysisId: number, days = 60) =>
  request<TrendPoint[]>(`/analysis/${analysisId}/trend?days=${days}`);

export const fetchAnomalies = (analysisId: number, tariff?: number) => {
  const tariffParam = tariff != null ? `&tariff=${tariff}` : '';
  return request<Anomaly[]>(`/analysis/${analysisId}/anomalies?min_risk=0&limit=50${tariffParam}`);
};

// ── Reports ────────────────────────────────────────────────────────────────

export const reportCsvUrl = (analysisId: number) => `${API_BASE}/reports/${analysisId}/csv`;

export const reportPrintUrl = (analysisId: number, tariff?: number) => {
  const tariffParam = tariff != null ? `&tariff=${tariff}` : '';
  return `${API_BASE}/reports/${analysisId}/print?simple=true${tariffParam}`;
};
