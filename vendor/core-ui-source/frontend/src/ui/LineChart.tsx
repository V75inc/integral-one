/**
 * LineChart — one or more series over a short row of labelled points (for example pay over the last runs).
 * Coloured from Core's chart palette; every point has a hover tip. Layer: Primitive.
 */
import { useId } from 'react';
import { useChartWidth } from './useChartWidth';

export interface LineChartSeries { key: string; label: string; values: number[] }
export interface LineChartProps {
  /** One label per point, oldest first. */
  labels: string[];
  series: LineChartSeries[];
  /** Hover text per point; defaults to the label with each series value. */
  tooltips?: string[];
  /** Describes the chart for assistive technology. */
  ariaLabel: string;
  /** How a value reads on the axis and at the end of a line; default is short (12K, 3.4M). */
  formatValue?: (value: number) => string;
}

const COLORS = ['var(--viz-1)', 'var(--viz-2)', 'var(--viz-total)'];
export const shortNumber = (n: number) => {
  const a = Math.abs(n);
  return (n < 0 ? '-' : '') + (a >= 1e6 ? (a / 1e6).toFixed(a >= 1e7 ? 1 : 2) + 'M' : a >= 1e3 ? Math.round(a / 1e3) + 'K' : String(Math.round(a)));
};

export function LineChart({ labels, series, tooltips, ariaLabel, formatValue = shortNumber }: LineChartProps) {
  const id = useId();
  const n = labels.length;
  const { ref, width: W } = useChartWidth(360, 1100, 720);
  const H = 220, L = 52, R = 70, T = 10, B = 26;
  if (n < 2 || series.length === 0) return null;
  const hi = Math.max(...series.flatMap(s => s.values)) * 1.08 || 1;
  const x = (i: number) => L + (i * (W - L - R)) / (n - 1);
  const y = (v: number) => T + (1 - v / hi) * (H - T - B);
  const step = Math.pow(10, Math.floor(Math.log10(hi / 4)));
  const tick = Math.ceil(hi / 4 / step) * step;
  const ticks: number[] = [];
  for (let v = 0; v <= hi; v += tick) ticks.push(v);
  const gap = (W - L - R) / (n - 1);
  const stride = Math.max(1, Math.ceil(46 / gap)); // show every label that fits, counting back from the newest
  // End labels, nudged apart when two lines finish close together.
  let ends = series.map(s => y(s.values[n - 1]));
  if (series.length === 2 && Math.abs(ends[0] - ends[1]) < 14) { const mid = (ends[0] + ends[1]) / 2; ends = ends[0] < ends[1] ? [mid - 7, mid + 7] : [mid + 7, mid - 7]; }
  const tip = (i: number) => tooltips?.[i] ?? `${labels[i]} · ${series.map(s => `${s.label} ${formatValue(s.values[i])}`).join(' · ')}`;
  return (
    <div ref={ref} className="flex flex-col gap-2">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full text-[11px] text-[var(--text-muted)]" role="img" aria-label={ariaLabel} aria-describedby={`${id}-legend`}>
        {ticks.map(v => <g key={v}><line x1={L} x2={W - R} y1={y(v)} y2={y(v)} stroke="var(--viz-grid)" strokeWidth="1" /><text x={L - 6} y={y(v) + 4} textAnchor="end" fill="currentColor">{formatValue(v)}</text></g>)}
        {labels.map((label, i) => ((n - 1 - i) % stride === 0 ? <text key={i} x={x(i)} y={H - 6} textAnchor={i === 0 && x(i) - L < 20 ? 'start' : 'middle'} fill="currentColor">{label}</text> : null))}
        {series.map((s, k) => (
          <g key={s.key}>
            <polyline points={s.values.map((v, i) => `${x(i)},${y(v)}`).join(' ')} fill="none" stroke={COLORS[k % COLORS.length]} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
            <circle cx={x(n - 1)} cy={y(s.values[n - 1])} r="4" fill={COLORS[k % COLORS.length]} stroke="var(--panel)" strokeWidth="2" />
            <text x={x(n - 1) + 8} y={ends[k] + 4} fill="var(--text)">{formatValue(s.values[n - 1])}</text>
          </g>
        ))}
        {labels.map((_, i) => <rect key={i} x={x(i) - gap / 2} y={T} width={gap} height={H - T - B} fill="transparent"><title>{tip(i)}</title></rect>)}
      </svg>
      <div id={`${id}-legend`} className="flex flex-wrap gap-4 text-xs text-[var(--text-muted)]">
        {series.map((s, k) => <span key={s.key} className="inline-flex items-center gap-1.5"><i className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: COLORS[k % COLORS.length] }} />{s.label}</span>)}
      </div>
    </div>
  );
}
