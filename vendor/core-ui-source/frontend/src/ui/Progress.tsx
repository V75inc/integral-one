/** Progress — a bar that fills smoothly as work completes, or slides when the amount is not known. Layer: Primitive. */
export interface ProgressProps {
  /** Percent complete, 0 to 100. Leave out when the amount is not known: the bar then slides. */
  value?: number;
  /** Says what is progressing, for assistive technology. */
  ariaLabel: string;
}

export function Progress({ value, ariaLabel }: ProgressProps) {
  const known = typeof value === 'number' && Number.isFinite(value);
  const pct = known ? Math.min(100, Math.max(0, value as number)) : 0;
  return (
    <div
      role="progressbar"
      aria-label={ariaLabel}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={known ? Math.round(pct) : undefined}
      className="relative h-2 w-full overflow-hidden rounded-full bg-[var(--panel-2)]"
    >
      <div
        className={['integral-progress-fill relative h-full overflow-hidden rounded-full bg-[var(--text-muted)]', known ? '' : 'integral-progress-unknown'].join(' ')}
        style={known ? { width: `${Math.max(pct, 2)}%` } : undefined}
      />
    </div>
  );
}
