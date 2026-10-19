import { describe, expect, it } from 'vitest';
import { resolveFieldDefault } from '../fieldDefaults';

describe('resolveFieldDefault', () => {
  it('resolves $today and today to local ISO date', () => {
    const now = new Date(2026, 8, 30); // Sep 30 local
    expect(resolveFieldDefault('$today', now)).toBe('2026-09-30');
    expect(resolveFieldDefault('today', now)).toBe('2026-09-30');
  });

  it('passes through other defaults', () => {
    expect(resolveFieldDefault('draft')).toBe('draft');
    expect(resolveFieldDefault(0)).toBe(0);
  });
});
