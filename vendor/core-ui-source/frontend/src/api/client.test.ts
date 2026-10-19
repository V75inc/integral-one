import { AxiosError, type AxiosAdapter, type AxiosResponse } from 'axios';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('./session', () => ({
  getAccessToken: vi.fn(), getRefreshToken: vi.fn(),
  isRefreshInFlight: () => false, markActivity: vi.fn(),
  redirectToLogin: vi.fn(), refreshAccessToken: vi.fn(),
}));
vi.mock('../lib/apiErrorNotifier', () => ({ clearApiFailure: vi.fn(), notifyApiFailure: vi.fn() }));

import apiClient from './client';
import { refreshAccessToken } from './session';

afterEach(() => vi.useRealTimers());

describe('API request deadlines', () => {
  it('passes a finite two-minute deadline to the transport and permits a delayed response', async () => {
    vi.useFakeTimers();
    const adapter: AxiosAdapter = vi.fn(config => new Promise<AxiosResponse>(resolve => {
      expect(config.timeout).toBe(120_000);
      setTimeout(() => resolve({ data: { done: true }, status: 200, statusText: 'OK', headers: {}, config }), 45_000);
    }));
    const request = apiClient.post('/tools/example', {}, { adapter });
    await vi.advanceTimersByTimeAsync(45_000);
    await expect(request).resolves.toMatchObject({ data: { done: true } });
    expect(adapter).toHaveBeenCalledTimes(1);
  });

  it('preserves explicit request deadlines', async () => {
    const adapter: AxiosAdapter = async config => {
      expect(config.timeout).toBe(5_000);
      return { data: {}, status: 200, statusText: 'OK', headers: {}, config };
    };
    await apiClient.get('/example', { adapter, timeout: 5_000 });
  });

  it.each(['ECONNABORTED', 'ETIMEDOUT'])('does not retry a mutation after %s and explains uncertain completion', async code => {
    const adapter: AxiosAdapter = vi.fn(async config => {
      throw new AxiosError('timeout', code, config);
    });
    await expect(apiClient.post('/tools/example', {}, { adapter })).rejects.toThrow('The change may still complete');
    expect(adapter).toHaveBeenCalledTimes(1);
    expect(refreshAccessToken).not.toHaveBeenCalled();
  });
});
