/** Theme-aligned chart palette — reads Integral CSS variables at render time. */

const FALLBACK = [
  '#ff5a1f',
  '#6366f1',
  '#0ea5e9',
  '#10b981',
  '#f59e0b',
  '#a855f7',
  '#ec4899',
  '#64748b',
];

export function getDashboardChartColors(): string[] {
  if (typeof document === 'undefined') return FALLBACK;
  const root = getComputedStyle(document.documentElement);
  const pick = (name: string, fb: string) =>
    root.getPropertyValue(name).trim() || fb;
  return [
    pick('--brand-accent', FALLBACK[0]),
    pick('--info-fg', FALLBACK[1]),
    '#0ea5e9',
    pick('--success-fg', FALLBACK[3]),
    pick('--warn-fg', FALLBACK[4]),
    '#a855f7',
    '#ec4899',
    pick('--text-subtle', FALLBACK[7]),
  ];
}

export const DASHBOARD_CHART_AXIS = {
  tick: { fill: 'var(--text-muted)', fontSize: 11 },
  axisLine: { stroke: 'var(--panel-border)' },
  tickLine: { stroke: 'var(--panel-border)' },
};

export const DASHBOARD_CHART_GRID = {
  stroke: 'var(--panel-border)',
  strokeDasharray: '3 3',
};

import type { CSSProperties } from 'react';

/** Opaque Recharts tooltip chrome — uses real surface tokens (not --panel-1). */
export function dashboardTooltipStyle(): CSSProperties {
  return {
    backgroundColor: 'var(--panel)',
    border: '1px solid var(--panel-border)',
    borderRadius: 'var(--radius-input)',
    boxShadow: 'var(--shadow-card)',
    color: 'var(--text)',
    fontSize: 12,
    padding: '8px 10px',
  };
}

export function dashboardTooltipLabelStyle(): CSSProperties {
  return { color: 'var(--text)', fontWeight: 500 };
}

export function dashboardTooltipItemStyle(): CSSProperties {
  return { color: 'var(--text-muted)' };
}
