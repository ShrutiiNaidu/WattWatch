import React, { useRef } from 'react';
import { ArrowRight, UploadCloud } from 'lucide-react';
import type { AppOperation, Dataset, UploadQuality } from '../types';

const issueLabels: Record<string, string> = {
  missing_timestamp: 'readings are missing a date or time',
  missing_consumption: 'readings are missing an electricity-use value',
  negative_consumption: 'readings have a negative electricity-use value',
  duplicate_records: 'readings appear more than once',
  large_gap: 'readings have a large time gap (over 2 hours)',
  non_numeric: 'readings have non-numeric values in the electricity column',
};

const fmt = (n: number | null | undefined, d = 1) =>
  n == null ? '—' : Number(n).toLocaleString('en-IN', { maximumFractionDigits: d });

interface Props {
  datasets: Dataset[];
  datasetId: number | null;
  analysis: { id: number } | null;
  quality: UploadQuality | null;
  busy: boolean;
  operation: AppOperation;
  progressStep: number;
  onUpload: (file: File) => void;
  onSelectDataset: (id: number) => void;
  onRunAnalysis: () => void;
  onLoadSample: () => void;
}

export function UploadSection({
  datasets,
  datasetId,
  analysis,
  quality,
  busy,
  operation,
  progressStep,
  onUpload,
  onSelectDataset,
  onRunAnalysis,
  onLoadSample,
}: Props) {
  const uploadRef = useRef<HTMLInputElement>(null);
  const demo = datasets.find(d => d.id === datasetId)?.is_demo;
  const issueCount = quality?.issues.reduce((t, i) => t + i.count, 0) ?? 0;

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const f = e.dataTransfer.files[0];
    if (f && !busy) onUpload(f);
  };

  return (
    <section id="check" className="checkSection section">
      <div className="sectionHeading">
        <div>
          <div className="eyebrow">01 · UPLOAD</div>
          <h2>Check your electricity usage.</h2>
          <p>Upload your meter readings. We'll explain what looks normal and what may be worth checking.</p>
        </div>
        <a className="sampleLink" href="/sample_electricity.csv" download>
          Download sample file
        </a>
      </div>

      {/* Drop zone */}
      <div
        className="uploadBox"
        onDragOver={e => e.preventDefault()}
        onDrop={handleDrop}
        role="region"
        aria-label="File upload area. Drag and drop a CSV file or use the choose button."
      >
        <div className="uploadIcon" aria-hidden="true">
          <UploadCloud size={30} />
        </div>
        <h3>Upload your meter readings</h3>
        <p>Drag and drop your CSV here, or choose a file from your device.</p>
        <button
          className="primaryBtn"
          disabled={busy}
          onClick={() => uploadRef.current?.click()}
          aria-label="Choose a CSV file to upload"
        >
          {busy && operation === 'upload' ? 'Please wait…' : 'Choose CSV file'}{' '}
          <ArrowRight size={17} aria-hidden="true" />
        </button>
        <input
          ref={uploadRef}
          className="fileInput"
          type="file"
          accept=".csv,text/csv"
          aria-label="Choose electricity meter readings CSV file"
          onChange={e => {
            const f = e.target.files?.[0];
            if (f) onUpload(f);
            // reset so same file can re-trigger
            e.target.value = '';
          }}
        />
        <small>We need when each reading was taken and how much electricity was used. A meter name is optional. Files up to 15 MB.</small>
      </div>

      {/* Sample link */}
      <div className="sampleActions">
        <span>Want to see how it works first?</span>
        <button className="sampleLinkButton" disabled={busy} onClick={onLoadSample}>
          Try a sample report
        </button>
      </div>

      {/* Recent files selector */}
      {datasets.length > 0 && (
        <div className="existing">
          <label htmlFor="recent-file">Choose a recent file:</label>
          <select
            id="recent-file"
            value={datasetId ?? ''}
            onChange={e => onSelectDataset(Number(e.target.value))}
          >
            <option value="" disabled>
              Choose a file to view
            </option>
            {datasets.slice(0, 8).map(d => (
              <option key={d.id} value={d.id}>
                {d.name}
                {d.is_demo ? ' · Demo data' : ''}
              </option>
            ))}
          </select>
          {demo && <span className="demoBadge">DEMO DATA</span>}
        </div>
      )}

      {/* Quality report */}
      {quality && (
        <div
          className={`quality ${issueCount ? 'qualityWarning' : 'qualityGood'}`}
          role="status"
          aria-live="polite"
        >
          <b>{issueCount ? 'A few things need a look' : 'Your file looks ready'}</b>
          <span>
            {fmt(quality.valid, 0)} usable readings out of {fmt(quality.total, 0)}
          </span>
          {issueCount > 0 && (
            <>
              <p>Some rows have issues and won't be used in the check. Correct them in your file, then upload it again.</p>
              <ul>
                {quality.issues
                  .filter(issue => issue.count > 0)
                  .map(issue => (
                    <li key={issue.type}>
                      {fmt(issue.count, 0)} {issueLabels[issue.type] ?? 'readings need a review'}.
                      {issue.message && <span className="issueDetail"> {issue.message}</span>}
                    </li>
                  ))}
              </ul>
              <button className="secondaryBtn" onClick={() => uploadRef.current?.click()}>
                Upload corrected file
              </button>
            </>
          )}
          {/* Soft warnings */}
          {quality.warnings && quality.warnings.length > 0 && (
            <div className="qualityNotes">
              <p>Notes (these don't block the check):</p>
              <ul>
                {quality.warnings.map((w, i) => (
                  <li key={i}>{typeof w === 'string' ? w : w.message}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* Ready to analyse */}
      {datasetId && !analysis && (
        <div className="readyCard">
          <div>
            <b>Your file is ready.</b>
            <p>We'll compare your readings with their usual pattern and point out anything unusual.</p>
          </div>
          <button className="primaryBtn" onClick={onRunAnalysis} disabled={busy}>
            {busy ? 'Checking…' : 'Check my electricity data'} <ArrowRight size={17} aria-hidden="true" />
          </button>
        </div>
      )}

      {/* Progress indicators */}
      {operation === 'analysis' && (
        <div className="progressCard" role="status" aria-live="polite">
          <b>Checking your electricity data…</b>
          <ol>
            <li className="complete">Reading your file</li>
            <li className={progressStep >= 1 ? 'active' : ''}>Understanding your usual usage</li>
            <li className={progressStep >= 2 ? 'active' : ''}>Preparing your results</li>
          </ol>
        </div>
      )}
      {operation === 'upload' && (
        <div className="progressCard" role="status" aria-live="polite">
          <b>Reading and checking your file…</b>
          <p>This can take a moment for larger files.</p>
        </div>
      )}
      {operation === 'sample' && (
        <div className="progressCard" role="status" aria-live="polite">
          <b>Loading the sample report…</b>
          <p>This data is synthetic and will be labelled as demo data.</p>
        </div>
      )}
    </section>
  );
}
