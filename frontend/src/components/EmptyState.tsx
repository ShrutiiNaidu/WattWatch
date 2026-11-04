import React from 'react';
import { ArrowRight, Zap, FileText, BarChart2 } from 'lucide-react';

type Variant = 'results' | 'anomalies' | 'tags' | 'noFile';

interface Props {
  variant: Variant;
}

const CONFIGS: Record<Variant, { icon: React.ReactNode; heading: string; body: string; cta?: { label: string; href: string } }> = {
  noFile: {
    icon: <Zap size={28} />,
    heading: 'Nothing to check yet.',
    body: 'Upload your electricity readings to see whether your usage looks normal.',
    cta: { label: 'Upload my data', href: '#check' },
  },
  results: {
    icon: <BarChart2 size={28} />,
    heading: 'No results yet.',
    body: 'Once you upload and check a file, your results will appear here.',
    cta: { label: 'Upload my data', href: '#check' },
  },
  anomalies: {
    icon: <FileText size={28} />,
    heading: 'No unusual readings found.',
    body: 'Your electricity use looks as expected across all the readings we checked.',
  },
  tags: {
    icon: <Zap size={28} />,
    heading: 'No tags yet.',
    body: "Once you explain a reading — for example, noting it was due to AC or EV charging — it'll appear here.",
  },
};

/** Polished empty state with illustration icon, explanation and optional CTA. */
export function EmptyState({ variant }: Props) {
  const cfg = CONFIGS[variant];
  return (
    <div className="emptyState">
      <div className="emptyState__icon">{cfg.icon}</div>
      <h2 className="emptyState__heading">{cfg.heading}</h2>
      <p className="emptyState__body">{cfg.body}</p>
      {cfg.cta && (
        <a className="primaryBtn" href={cfg.cta.href}>
          {cfg.cta.label} <ArrowRight size={17} />
        </a>
      )}
    </div>
  );
}
