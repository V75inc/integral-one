/**
 * LevelMeter — live input level as a few bars.
 *
 * Decorative (`aria-hidden`): pair it with a text status for assistive tech.
 * Used by the composer mic while dictating and the voice-input settings mic
 * test.
 */

const BAR_WEIGHTS = [0.55, 1, 0.75, 0.9, 0.6];

export interface LevelMeterProps {
  /** 0..1. Values outside the range are clamped. */
  level: number;
  /** Default 3. */
  bars?: number;
  /** Layout-positioning classes only. */
  className?: string;
}

export function LevelMeter({ level, bars = 3, className }: LevelMeterProps) {
  const clamped = Math.max(0, Math.min(1, Number.isFinite(level) ? level : 0));
  return (
    <span
      aria-hidden
      data-level={clamped.toFixed(2)}
      className={['inline-flex h-4 items-center gap-[2px]', className ?? '']
        .filter(Boolean)
        .join(' ')}
    >
      {Array.from({ length: bars }, (_, i) => {
        const weight = BAR_WEIGHTS[i % BAR_WEIGHTS.length];
        const height = 20 + Math.round(clamped * weight * 80);
        return (
          <span
            key={i}
            className="w-[3px] rounded-full bg-[var(--brand-accent)] transition-[height] duration-75"
            style={{ height: `${height}%` }}
          />
        );
      })}
    </span>
  );
}
