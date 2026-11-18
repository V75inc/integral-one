/** Stat — one headline figure with its note, change since last time and a small trend line. Layer: Primitive. */
import type { ReactNode } from 'react';
import { Text } from './Text';
import { Surface } from './Surface';
import { Stack } from './Stack';

export interface StatProps {
  label: ReactNode;
  value: ReactNode;
  /** Small text under the value. */
  note?: ReactNode;
  /** The change since last time, as text (include the arrow and sign). */
  delta?: ReactNode;
  /** Make this the headline tile: a larger value. */
  emphasis?: boolean;
  /** Recent values, oldest first, drawn as a small line. */
  trend?: number[];
  /** Describes the trend for assistive technology. */
  trendLabel?: string;
}

function Sparkline({ values, label }: { values: number[]; label?: string }) {
  if (values.length < 2) return null;
  const w = 160, h = 28, lo = Math.min(...values), hi = Math.max(...values), span = hi - lo || 1;
  const x = (i: number) => 2 + (i * (w - 4)) / (values.length - 1);
  const y = (v: number) => h - 3 - ((v - lo) / span) * (h - 6);
  const points = values.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-7 w-full max-w-[10rem] text-[var(--text-muted)]" role="img" aria-label={label || 'Trend'} preserveAspectRatio="none">
      <polyline points={points} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={x(values.length - 1)} cy={y(values[values.length - 1])} r="2.5" fill="currentColor" />
    </svg>
  );
}

export function Stat({ label, value, note, delta, emphasis, trend, trendLabel }: StatProps) {
  return (
    <Surface tone="panel" border="default" padding="md" className="h-full min-w-0">
      <Stack gap="xs">
        <Text as="div" variant="meta" tone="muted">{label}</Text>
        <Text as="div" variant={emphasis ? 'display-sm' : 'heading-md'} className="tabular-nums">{value}</Text>
        {delta ? <Text as="div" variant="meta" tone="muted">{delta}</Text> : null}
        {note ? <Text as="div" variant="meta" tone="muted">{note}</Text> : null}
        {trend ? <Sparkline values={trend} label={trendLabel} /> : null}
      </Stack>
    </Surface>
  );
}
