import React from 'react';

interface SkeletonProps {
  /** CSS class for sizing context */
  className?: string;
}

/** Animated shimmer placeholder for loading states. */
export function SkeletonBlock({ className = '' }: SkeletonProps) {
  return <div className={`skeleton ${className}`} aria-hidden="true" />;
}

/** Skeleton for a single summary stat card. */
export function SkeletonStatCard() {
  return (
    <div className="skeletonStatCard" aria-hidden="true">
      <SkeletonBlock className="skeleton--label" />
      <SkeletonBlock className="skeleton--number" />
      <SkeletonBlock className="skeleton--sub" />
    </div>
  );
}

/** Skeleton for the trend chart area. */
export function SkeletonChart() {
  return (
    <div className="skeletonChart" aria-hidden="true" aria-label="Loading chart…">
      <SkeletonBlock className="skeleton--chart" />
    </div>
  );
}

/** Skeleton for the anomaly list (shows 3 placeholder rows). */
export function SkeletonAnomalyList() {
  return (
    <div className="skeletonAnomalyList" aria-busy="true" aria-label="Loading anomaly list…">
      {[0, 1, 2].map(i => (
        <div key={i} className="skeletonAnomaly" aria-hidden="true">
          <SkeletonBlock className="skeleton--mark" />
          <div className="skeletonAnomaly__body">
            <SkeletonBlock className="skeleton--title" />
            <SkeletonBlock className="skeleton--text" />
          </div>
        </div>
      ))}
    </div>
  );
}
