import React from 'react';
import type { Anomaly, AnomalyTag } from '../types';
import { BRAND } from '../config/brand';

interface InsightRule {
  test: (h: number, anomaly: Anomaly, tag: AnomalyTag | null) => boolean;
  message: (anomaly: Anomaly, tag: AnomalyTag | null, tariff: number) => string;
}

const RULES: InsightRule[] = [
  // Late night standby
  {
    test: h => h >= 0 && h < 5,
    message: () =>
      'Late-night spike: Check always-on devices — old fridges, set-top boxes, chargers, and geyser timers are common culprits.',
  },
  // EV Charging tag → off-peak tip
  {
    test: (_, __, tag) => tag === 'EV Charging',
    message: () =>
      'EV Charging detected. Consider scheduling charging between 11 PM and 5 AM when grid rates are typically lower.',
  },
  // AC afternoon
  {
    test: h => h >= 10 && h < 16,
    message: () =>
      'Afternoon spike: Often from air conditioning. Raising the set-point by 1–2°C typically cuts AC power by 6–8%.',
  },
  // Morning geyser
  {
    test: h => h >= 5 && h < 10,
    message: () =>
      'Morning spike: Geysers are a common cause. A solar water heater or a timer set to pre-heat before peak hours can help.',
  },
  // Evening routine
  {
    test: h => h >= 18 && h < 22,
    message: () =>
      'Evening spike: Cooking, laundry and lighting peak together. Shifting the washing machine or dishwasher to off-peak hours saves money.',
  },
];

interface Props {
  anomalies: Anomaly[];
  tags: Record<number, AnomalyTag | null>;
  tariff: number;
}

function dedupe(msgs: string[]): string[] {
  return [...new Set(msgs)];
}

export function InsightCard({ anomalies, tags, tariff }: Props) {
  // Only generate insights for untagged/unexplained anomalies (or EV-tag)
  const messages: string[] = [];

  for (const a of anomalies) {
    const tag = tags[a.id] ?? null;
    const h = new Date(a.timestamp).getHours();
    for (const rule of RULES) {
      if (rule.test(h, a, tag)) {
        messages.push(rule.message(a, tag, tariff));
        break; // one rule per anomaly
      }
    }
  }

  const unique = dedupe(messages).slice(0, 4);

  if (unique.length === 0) return null;

  return (
    <div className="insightCard card" aria-label="Actionable insights">
      <div className="cardLabel">WHAT YOU CAN DO</div>
      <h3>Suggestions based on your data</h3>
      <ol className="insightList">
        {unique.map((msg, i) => (
          <li key={i}>{msg}</li>
        ))}
      </ol>
    </div>
  );
}
