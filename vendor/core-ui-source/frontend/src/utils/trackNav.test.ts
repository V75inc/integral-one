import { describe, expect, it } from 'vitest';
import { isTrackNavVisible } from './trackNav';

describe('isTrackNavVisible', () => {
  it('treats missing nav_visible as visible', () => {
    expect(isTrackNavVisible({ title: 'Customers' } as never)).toBe(true);
    expect(isTrackNavVisible({ nav_visible: true })).toBe(true);
  });

  it('hides nav_visible false', () => {
    expect(isTrackNavVisible({ nav_visible: false })).toBe(false);
  });

  it('hides settings kind even when nav_visible is true', () => {
    expect(isTrackNavVisible({ kind: 'settings', nav_visible: true })).toBe(false);
  });

  it('returns false for nullish', () => {
    expect(isTrackNavVisible(null)).toBe(false);
    expect(isTrackNavVisible(undefined)).toBe(false);
  });
});
