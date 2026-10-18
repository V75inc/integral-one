/** Google Docs–aligned document theme — keep in sync with backend document_theme.py */

import type { CSSProperties } from 'react';

export type PageSizeKey = 'letter' | 'legal' | 'a4' | 'letter_landscape';

export const PAGE_SIZE_INCHES: Record<PageSizeKey, [number, number]> = {
  letter: [8.5, 11],
  legal: [8.5, 14],
  a4: [8.27, 11.69],
  letter_landscape: [11, 8.5],
};

export const DEFAULT_PAGE_SIZE: PageSizeKey = 'letter';

export const DEFAULT_MARGINS_IN = {
  top: 1,
  right: 1,
  bottom: 1,
  left: 1,
} as const;

export type MarginsInches = {
  top: number;
  right: number;
  bottom: number;
  left: number;
};

export const MARGIN_PRESETS: Record<string, MarginsInches> = {
  normal: { top: 1, right: 1, bottom: 1, left: 1 },
  narrow: { top: 0.5, right: 0.5, bottom: 0.5, left: 0.5 },
  wide: { top: 1, right: 2, bottom: 1, left: 2 },
};

export const BODY_FONT_FAMILY = 'Arial, Helvetica, sans-serif';
export const BODY_FONT_SIZE = '11pt';
export const BODY_LINE_HEIGHT = '1.15';

export const FONT_FAMILY_OPTIONS = [
  { value: '', label: 'Arial' },
  { value: "'Times New Roman', Times, serif", label: 'Times New Roman' },
  { value: 'Georgia, serif', label: 'Georgia' },
  { value: "'Courier New', Courier, monospace", label: 'Courier New' },
] as const;

export const FONT_SIZE_OPTIONS = [
  '8',
  '9',
  '10',
  '11',
  '12',
  '14',
  '16',
  '18',
  '20',
  '24',
  '28',
  '36',
] as const;

export const PX_PER_INCH = 96;

export function normalizePageSize(raw?: string | null): PageSizeKey {
  let key = (raw || DEFAULT_PAGE_SIZE).toLowerCase();
  if (key === 'us_legal') key = 'legal';
  if (key === 'legal') return 'legal';
  if (key === 'a4') return 'a4';
  if (key === 'landscape' || key === 'letter-landscape' || key === 'letter_landscape') {
    return 'letter_landscape';
  }
  return 'letter';
}

export function normalizeMargins(raw?: Partial<MarginsInches> | null): MarginsInches {
  const base: MarginsInches = {
    top: DEFAULT_MARGINS_IN.top,
    right: DEFAULT_MARGINS_IN.right,
    bottom: DEFAULT_MARGINS_IN.bottom,
    left: DEFAULT_MARGINS_IN.left,
  };
  if (!raw) return base;
  for (const side of ['top', 'right', 'bottom', 'left'] as const) {
    const v = raw[side];
    if (typeof v === 'number' && Number.isFinite(v)) {
      base[side] = Math.max(0.25, Math.min(3, v));
    }
  }
  return base;
}

export function pageWidthPx(pageSize: PageSizeKey): number {
  const [wIn] = PAGE_SIZE_INCHES[pageSize];
  return Math.round(wIn * PX_PER_INCH);
}

export function pageContentBoxStyle(
  pageSize: PageSizeKey,
  margins: MarginsInches,
): CSSProperties {
  const [wIn, hIn] = PAGE_SIZE_INCHES[pageSize];
  return {
    width: `${Math.round(wIn * PX_PER_INCH)}px`,
    minHeight: `${Math.round(hIn * PX_PER_INCH)}px`,
    paddingTop: `${Math.round(margins.top * PX_PER_INCH)}px`,
    paddingRight: `${Math.round(margins.right * PX_PER_INCH)}px`,
    paddingBottom: `${Math.round(margins.bottom * PX_PER_INCH)}px`,
    paddingLeft: `${Math.round(margins.left * PX_PER_INCH)}px`,
  };
}
