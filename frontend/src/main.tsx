import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Info, Zap } from 'lucide-react';
import { BRAND } from './config/brand';
import {
  analyzeDataset,
  fetchAnalysis,
  fetchAnomalies,
  fetchDataset,
  fetchDatasets,
  fetchSummary,
  fetchTrend,
  loadSampleDataset,
  uploadCSV,
} from './api/client';
import type { Analysis, Anomaly, AnomalyTag, Dataset, Summary, TagMap, TrendPoint, UploadQuality } from './types';
import { Navbar } from './components/Navbar';
import { ToastStack } from './components/Toast';
import { HeroSection } from './components/HeroSection';
import { UploadSection } from './components/UploadSection';
import { ResultsSection } from './components/ResultsSection';
import { useToasts } from './hooks/useToasts';
import './styles.css';

// ─── Friendly error messages ──────────────────────────────────────────────────
function friendlyError(error: unknown, context: 'upload' | 'analysis' | 'load'): string {
  const message = error instanceof Error ? error.message.toLowerCase() : '';
  if (message.includes('failed to fetch') || message.includes('networkerror'))
    return 'We could not reach the electricity-check service. Please try again in a moment.';
  if (message.includes('15 mb'))
    return 'This file is larger than 15 MB. Please choose a smaller CSV file.';
  if (message.includes('timestamp/date column') || message.includes('consumption/energy column'))
    return 'We could not find both the date/time and electricity-use columns. Please check the sample file and try again.';
  if (message.includes('too small') || message.includes('at least 20'))
    return 'This file has too few readings to check reliably. Please include at least 20 readings and try again.';
  if (message.includes('could not read csv') || message.includes('not a csv'))
    return 'We could not read this file as a CSV. Please check the file format and try again.';
  if (context === 'upload')
    return 'We could not check this file. Please make sure it is a valid CSV with dates and electricity-use readings.';
  if (context === 'analysis')
    return 'We could not complete the check. Please try again.';
  return 'We could not load this file. Please try again.';
}

// ─── Tag persistence ──────────────────────────────────────────────────────────
function loadTags(analysisId: number | null): TagMap {
  if (!analysisId) return {};
  try {
    const raw = localStorage.getItem(`${BRAND.TAG_STORAGE_PREFIX}:${analysisId}`);
    return raw ? (JSON.parse(raw) as TagMap) : {};
  } catch {
    return {};
  }
}

function saveTags(analysisId: number, tags: TagMap) {
  localStorage.setItem(`${BRAND.TAG_STORAGE_PREFIX}:${analysisId}`, JSON.stringify(tags));
}

function loadTariff(): number {
  try {
    const raw = localStorage.getItem(BRAND.TARIFF_STORAGE_KEY);
    const val = raw ? parseFloat(raw) : NaN;
    return isFinite(val) && val > 0 ? val : BRAND.DEFAULT_TARIFF_PER_KWH;
  } catch {
    return BRAND.DEFAULT_TARIFF_PER_KWH;
  }
}

// ─── App ──────────────────────────────────────────────────────────────────────
function App() {
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [datasetId, setDatasetId] = useState<number | null>(null);
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [trend, setTrend] = useState<TrendPoint[]>([]);
  const [anomalies, setAnomalies] = useState<Anomaly[]>([]);
  const [quality, setQuality] = useState<UploadQuality | null>(null);
  const [busy, setBusy] = useState(false);
  const [operation, setOperation] = useState<'upload' | 'analysis' | 'sample' | null>(null);
  const [progressStep, setProgressStep] = useState(0);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [loadingResults, setLoadingResults] = useState(false);
  const [tariff, setTariffState] = useState<number>(loadTariff);
  const [tags, setTags] = useState<TagMap>({});

  const { toasts, dismiss, error: toastError, success: toastSuccess } = useToasts();

  const handleTariffChange = useCallback((val: number) => {
    setTariffState(val);
    localStorage.setItem(BRAND.TARIFF_STORAGE_KEY, String(val));
  }, []);

  const handleTagChange = useCallback((anomalyId: number, tag: AnomalyTag | null) => {
    setTags(prev => {
      const next = { ...prev };
      if (tag == null) delete next[anomalyId];
      else next[anomalyId] = tag;
      if (analysis) saveTags(analysis.id, next);
      return next;
    });
  }, [analysis]);

  const loadAnalysis = useCallback(async (a: Analysis) => {
    setLoadingResults(true);
    try {
      const [s, t, an] = await Promise.all([
        fetchSummary(a.id),
        fetchTrend(a.id, 60),
        fetchAnomalies(a.id, tariff),
      ]);
      setAnalysis(a);
      setSummary(s);
      setTrend(t);
      setAnomalies(an);
      setTags(loadTags(a.id));
    } finally {
      setLoadingResults(false);
    }
  }, [tariff]);

  const loadDataset = useCallback(async (id: number) => {
    setSummary(null); setTrend([]); setAnomalies([]); setAnalysis(null);
    const d = await fetchDataset(id);
    setDatasetId(id);
    if (d.analysis) {
      const a = await fetchAnalysis(d.analysis.id);
      await loadAnalysis(a);
    } else {
      setSummary(null); setTrend([]); setAnomalies([]);
    }
  }, [loadAnalysis]);

  const refresh = useCallback(async () => {
    try {
      const ds = await fetchDatasets();
      setDatasets(ds);
      if (datasetId) {
        await loadDataset(datasetId);
      } else {
        const recent = ds.find(item => !item.is_demo);
        if (recent) await loadDataset(recent.id);
      }
    } catch (e) {
      toastError(friendlyError(e, 'load'));
    }
  }, [datasetId, loadDataset, toastError]);

  useEffect(() => { refresh(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const selectDataset = async (id: number) => {
    try { await loadDataset(id); }
    catch (e) { toastError(friendlyError(e, 'load')); }
  };

  const upload = async (file: File) => {
    // Client-side validation before sending
    if (!file.name.toLowerCase().endsWith('.csv')) {
      toastError('Please choose a CSV file containing dates and electricity-use readings.');
      return;
    }
    if (file.size > 15 * 1024 * 1024) {
      toastError('This file is larger than 15 MB. Please choose a smaller CSV file.');
      return;
    }

    setBusy(true); setOperation('upload'); setQuality(null);
    try {
      const r = await uploadCSV(file);
      setQuality(r.quality);
      const ds = await fetchDatasets();
      setDatasets(ds);
      await loadDataset(r.dataset_id);
      toastSuccess('Your readings are ready.');
      setTimeout(() => document.getElementById('check-results')?.scrollIntoView({ behavior: 'smooth' }), 150);
    } catch (e) {
      toastError(friendlyError(e, 'upload'));
    } finally {
      setBusy(false); setOperation(null);
    }
  };

  const runAnalysis = async () => {
    if (!datasetId) return;
    setBusy(true); setOperation('analysis'); setProgressStep(1);
    try {
      const r = await analyzeDataset(datasetId);
      setProgressStep(2);
      const a = await fetchAnalysis(r.analysis_id);
      await loadAnalysis(a);
      toastSuccess('Check complete.');
      setTimeout(() => document.getElementById('check-results')?.scrollIntoView({ behavior: 'smooth' }), 100);
    } catch (e) {
      toastError(friendlyError(e, 'analysis'));
    } finally {
      setBusy(false); setOperation(null);
    }
  };

  const loadSample = async () => {
    setBusy(true); setOperation('sample');
    try {
      const existingDemo = datasets.find(d => d.is_demo);
      if (existingDemo) {
        await loadDataset(existingDemo.id);
      } else {
        const r = await loadSampleDataset();
        const ds = await fetchDatasets();
        setDatasets(ds);
        await loadDataset(r.dataset_id);
      }
      toastSuccess('Sample data is ready. It is clearly marked as demo data.');
    } catch (e) {
      toastError(friendlyError(e, 'load'));
    } finally {
      setBusy(false); setOperation(null);
    }
  };

  const selectedDataset = datasets.find(d => d.id === datasetId);

  return (
    <div className="app">
      <Navbar
        mobileOpen={mobileOpen}
        onToggleMobile={() => setMobileOpen(v => !v)}
        onNavClick={() => setMobileOpen(false)}
      />

      <ToastStack toasts={toasts} onDismiss={dismiss} />

      <main>
        <HeroSection />

        <UploadSection
          datasets={datasets}
          datasetId={datasetId}
          analysis={analysis}
          quality={quality}
          busy={busy}
          operation={operation}
          progressStep={progressStep}
          onUpload={upload}
          onSelectDataset={selectDataset}
          onRunAnalysis={runAnalysis}
          onLoadSample={loadSample}
        />

        <ResultsSection
          summary={summary}
          trend={trend}
          anomalies={anomalies}
          analysis={analysis}
          dataset={selectedDataset}
          tariff={tariff}
          loading={loadingResults}
          tags={tags}
          onTariffChange={handleTariffChange}
          onTagChange={handleTagChange}
        />

        {/* How it works */}
        <section id="how" className="how section">
          <div className="eyebrow">HOW IT WORKS</div>
          <h2>Three steps. No technical knowledge needed.</h2>
          <div className="steps">
            <div>
              <span>01</span>
              <h3>Upload</h3>
              <p>Give us your electricity readings in CSV format.</p>
            </div>
            <div>
              <span>02</span>
              <h3>We compare</h3>
              <p>We look at your meter's usual pattern and find readings that look different.</p>
            </div>
            <div>
              <span>03</span>
              <h3>You understand</h3>
              <p>We explain what changed, how unusual it is, and what you can check next.</p>
            </div>
          </div>
        </section>

        {/* About */}
        <section id="about" className="about section">
          <div className="aboutInner">
            <div>
              <div className="eyebrow">ABOUT WATTWATCH</div>
              <h2>Built to make electricity data understandable.</h2>
            </div>
            <div>
              <p>
                WattWatch helps people understand their electricity usage by pointing out readings that differ from
                their usual pattern. The goal is simple: make electricity data easier to understand, without
                requiring technical knowledge.
              </p>
              <p className="note">
                <Info size={16} aria-hidden="true" /> An unusual reading does <b>not</b> prove electricity theft,
                wastage, a faulty meter, or any other specific cause. Always check the context before taking action.
              </p>
            </div>
          </div>
        </section>
      </main>

      <footer>
        <div className="footerLogo">
          <span className="logoMark" aria-hidden="true">
            <Zap size={16} />
          </span>{' '}
          WATTWATCH
        </div>
        <span>{BRAND.APP_TAGLINE}</span>
        <span>© {new Date().getFullYear()}</span>
      </footer>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
