import { useState } from 'react';

/**
 * ColorPicker — curated palette of 16 identity colors used to brand
 * Tracks, Apps, and Organizations. The palette intentionally avoids
 * pure-saturated primaries; every swatch reads well against both light
 * (#fafafa) and dark (#1a1a1a) canvases, and pairs cleanly with white text
 * for the brand-accent badge case.
 *
 * Selecting `null` (the leftmost slot) restores the platform default
 * (which falls back to `--brand-accent`).
 */
export const COLOR_SWATCHES: Array<{ name: string; value: string }> = [
  { name: 'Coral',     value: '#ff5a1f' },
  { name: 'Persimmon', value: '#e35a3a' },
  { name: 'Marigold',  value: '#e29d3a' },
  { name: 'Mustard',   value: '#c98715' },
  { name: 'Olive',     value: '#7a8b3a' },
  { name: 'Forest',    value: '#2f9856' },
  { name: 'Teal',      value: '#1f9c8e' },
  { name: 'Cerulean',  value: '#3a8ec8' },
  { name: 'Indigo',    value: '#4a6cd6' },
  { name: 'Iris',      value: '#6f5acf' },
  { name: 'Plum',      value: '#8c4fb0' },
  { name: 'Magenta',   value: '#c0397f' },
  { name: 'Rose',      value: '#c14848' },
  { name: 'Sand',      value: '#a48864' },
  { name: 'Stone',     value: '#6b6b73' },
  { name: 'Slate',     value: '#3a3f47' },
];

interface ColorPickerProps {
  value: string | null | undefined;
  onChange: (next: string | null) => void;
  /** Allow the leftmost "default" slot. Defaults to true. */
  allowClear?: boolean;
  className?: string;
  size?: 'sm' | 'md';
  ariaLabel?: string;
}

export function ColorPicker({
  value,
  onChange,
  allowClear = true,
  className = '',
  size = 'md',
  ariaLabel = 'Identity color',
}: ColorPickerProps) {
  const [hover, setHover] = useState<string | null>(null);
  const px = size === 'sm' ? 22 : 28;
  const normalizedValue = (value || '').trim().toLowerCase() || null;

  return (
    <div className={`flex flex-col gap-2 ${className}`}>
      <div
        role="radiogroup"
        aria-label={ariaLabel}
        className="grid grid-cols-9 gap-1"
      >
        {allowClear && (
          <button
            type="button"
            role="radio"
            aria-checked={normalizedValue === null}
            aria-label="Use default color"
            title="Use default"
            onClick={() => onChange(null)}
            onMouseEnter={() => setHover('default')}
            onMouseLeave={() => setHover(null)}
            className={[
              'rounded-full transition-[transform,box-shadow] duration-fast',
              'flex items-center justify-center',
              'border border-dashed',
              normalizedValue === null
                ? 'border-[var(--brand-accent)] scale-110 shadow-[var(--shadow-sm)]'
                : 'border-[var(--panel-border)] hover:scale-105',
            ].join(' ')}
            style={{ width: px, height: px }}
          >
            <span
              aria-hidden
              className="block w-2.5 h-px bg-[var(--text-subtle)] rotate-45"
            />
          </button>
        )}
        {COLOR_SWATCHES.map((s) => {
          const selected = normalizedValue === s.value.toLowerCase();
          return (
            <button
              key={s.value}
              type="button"
              role="radio"
              aria-checked={selected}
              aria-label={s.name}
              title={`${s.name} · ${s.value}`}
              onClick={() => onChange(s.value)}
              onMouseEnter={() => setHover(s.value)}
              onMouseLeave={() => setHover(null)}
              className={[
                'rounded-full transition-[transform,box-shadow] duration-fast',
                selected
                  ? 'scale-110 shadow-[var(--shadow-sm)] ring-2 ring-offset-1 ring-offset-[var(--panel)] ring-[var(--text)]'
                  : 'hover:scale-105',
              ].join(' ')}
              style={{ width: px, height: px, backgroundColor: s.value }}
            />
          );
        })}
      </div>
      <div className="text-xs text-[var(--text-subtle)] h-4 leading-4">
        {hover === 'default'
          ? 'Use default'
          : hover
            ? COLOR_SWATCHES.find((s) => s.value === hover)?.name
            : normalizedValue === null
              ? 'Default'
              : COLOR_SWATCHES.find((s) => s.value.toLowerCase() === normalizedValue)?.name ?? value}
      </div>
    </div>
  );
}
