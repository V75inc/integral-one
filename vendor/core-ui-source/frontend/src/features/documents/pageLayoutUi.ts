import type { MarginsInches, PageSizeKey } from './documentTheme';
import { MARGIN_PRESETS } from './documentTheme';

export type LayoutSourceMode = 'saved' | 'custom';

export const PAGE_SIZE_OPTIONS: {
  key: PageSizeKey;
  label: string;
  detail: string;
}[] = [
  { key: 'letter', label: 'US Letter', detail: '8.5 × 11 in' },
  { key: 'letter_landscape', label: 'Letter landscape', detail: '11 × 8.5 in' },
  { key: 'legal', label: 'US Legal', detail: '8.5 × 14 in' },
  { key: 'a4', label: 'A4', detail: '210 × 297 mm' },
];

export const MARGIN_PRESET_OPTIONS: {
  key: string;
  label: string;
  hint: string;
  margins: MarginsInches;
}[] = [
  {
    key: 'normal',
    label: 'Standard',
    hint: 'Balanced space around your content',
    margins: MARGIN_PRESETS.normal,
  },
  {
    key: 'narrow',
    label: 'Compact',
    hint: 'More room for text and tables',
    margins: MARGIN_PRESETS.narrow,
  },
  {
    key: 'wide',
    label: 'Wide sides',
    hint: 'Extra space on the left and right',
    margins: MARGIN_PRESETS.wide,
  },
];

export function marginPresetKeyFor(margins: MarginsInches): string {
  const match = MARGIN_PRESET_OPTIONS.find(
    p =>
      p.margins.top === margins.top &&
      p.margins.right === margins.right &&
      p.margins.bottom === margins.bottom &&
      p.margins.left === margins.left,
  );
  return match?.key || 'normal';
}
