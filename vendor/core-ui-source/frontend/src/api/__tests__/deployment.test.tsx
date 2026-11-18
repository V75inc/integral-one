import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import axios from 'axios';
import { loadSessionPolicy, getSessionPolicy } from '../sessionPolicy';
import { useDeployment } from '../../hooks/useDeployment';

vi.mock('axios', () => ({ default: { get: vi.fn() } }));
afterEach(cleanup);

it('shares one public request between session bootstrap and capability consumers', async () => {
  let finish!: (value: unknown) => void;
  vi.mocked(axios.get).mockReturnValue(new Promise(resolve => { finish = resolve; }));
  const policy = loadSessionPolicy();
  const first = renderHook(useDeployment);
  const second = renderHook(useDeployment);
  expect(axios.get).toHaveBeenCalledExactlyOnceWith('/api/meta/deployment', { timeout: 5000 });
  await act(async () => {
    finish({ data: { profile: 'server', identity: 'account', features: { collaboration: true }, session_policy: { idle_timeout_seconds: 123 } } });
    await policy;
  });
  await waitFor(() => expect(first.result.current.data?.profile).toBe('server'));
  expect(second.result.current.data).toBe(first.result.current.data);
  expect(getSessionPolicy().idle_timeout_seconds).toBe(123);
  first.unmount();
  second.unmount();
  renderHook(useDeployment);
  expect(axios.get).toHaveBeenCalledTimes(1);
});

it('retries a failed public request when a capability consumer remounts', async () => {
  vi.resetModules();
  const { useDeployment: useRetryableDeployment } = await import('../../hooks/useDeployment');
  vi.mocked(axios.get).mockReset().mockRejectedValueOnce(new Error('offline'))
    .mockResolvedValueOnce({ data: { profile: 'server', features: { collaboration: true } } });
  const failed = renderHook(useRetryableDeployment);
  await waitFor(() => expect(failed.result.current.error).toBeInstanceOf(Error));
  failed.unmount();
  const retry = renderHook(useRetryableDeployment);
  await waitFor(() => expect(retry.result.current.data?.profile).toBe('server'));
  expect(axios.get).toHaveBeenCalledTimes(2);
});
