import { describe, expect, it } from 'vitest';

import { mapSessionError } from '../useDictation';

function axiosLike(status: number): unknown {
  return { response: { status } };
}

describe('mapSessionError', () => {
  it('maps 409 to not-configured', () => {
    expect(mapSessionError(axiosLike(409)).code).toBe('not-configured');
  });

  it('maps 403 to not-configured', () => {
    expect(mapSessionError(axiosLike(403)).code).toBe('not-configured');
  });

  it('maps 429 to rate-limited', () => {
    expect(mapSessionError(axiosLike(429)).code).toBe('rate-limited');
  });

  it('maps 503 to provider-unavailable', () => {
    expect(mapSessionError(axiosLike(503)).code).toBe('provider-unavailable');
  });

  it('maps network failures without a status', () => {
    expect(mapSessionError(new Error('Network Error')).code).toBe('network');
  });
});
