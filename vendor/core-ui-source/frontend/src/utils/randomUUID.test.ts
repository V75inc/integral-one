import { afterEach, describe, expect, it, vi } from 'vitest';
import { randomUUID } from './randomUUID';

afterEach(() => vi.unstubAllGlobals());

describe('randomUUID on local HTTP', () => {
  it('preserves native UUID generation where available', () => {
    vi.stubGlobal('crypto', { randomUUID: () => 'native-uuid' });
    expect(randomUUID()).toBe('native-uuid');
  });

  it('uses browser entropy with correct version and variant when randomUUID is absent', () => {
    let calls = 0;
    vi.stubGlobal('crypto', {
      getRandomValues: (bytes: Uint8Array) => bytes.fill(++calls),
    });
    const first = randomUUID();
    expect(first).toBe('01010101-0101-4101-8101-010101010101');
    expect(randomUUID()).not.toBe(first);
  });

  it('refuses a predictable replacement when browser entropy is unavailable', () => {
    vi.stubGlobal('crypto', undefined);
    expect(() => randomUUID()).toThrow('cannot generate a request ID');
  });
});
