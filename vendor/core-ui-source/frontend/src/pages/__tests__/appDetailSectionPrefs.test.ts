import { beforeEach, describe, expect, it } from 'vitest';
import { readAppDetailSection, writeAppDetailSection } from '../appDetailSectionPrefs';
beforeEach(() => localStorage.clear());
describe('App section preference', () => {
  it('defaults to the prescribed home while preserving explicit tab choices', () => {
    expect(readAppDetailSection('a1', 'home')).toBe('home');
    writeAppDetailSection('a1', 'tracks');
    expect(readAppDetailSection('a1', 'home')).toBe('tracks');
    writeAppDetailSection('a1', 'dashboards');
    expect(readAppDetailSection('a1', 'home')).toBe('dashboards');
  });
  it('does not retain an unavailable home after its declaration is removed', () => {
    writeAppDetailSection('a1', 'home');
    expect(readAppDetailSection('a1', 'home')).toBe('home');
    expect(readAppDetailSection('a1')).toBe('tracks');
  });
});
