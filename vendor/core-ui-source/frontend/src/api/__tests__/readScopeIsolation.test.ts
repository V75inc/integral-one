import { afterEach, expect, it, vi } from 'vitest';
import apiClient, { setActiveScopeHeader } from '../client';
import { appsApi } from '../apps';
import { clearTokens, setTokens } from '../session';

afterEach(() => {
  clearTokens();
  setActiveScopeHeader(null);
  vi.useRealTimers();
  vi.restoreAllMocks();
});

it.each(['workspace', 'login', 'peer-tab', 'logout'])('isolates an outer API flight across a %s change after its TTL', async boundary => {
  vi.useFakeTimers();
  setTokens({ access_token: 'principal-a', expires_in: 3600 });
  setActiveScopeHeader('ws:a');
  let finishOld!: (value: unknown) => void;
  const get = vi.spyOn(apiClient, 'get').mockReturnValueOnce(new Promise(resolve => { finishOld = resolve; }))
    .mockResolvedValue({ data: { apps: [{ id: 'current' }] } });
  const old = appsApi.list();
  await vi.advanceTimersByTimeAsync(3000);
  // An unchanged boundary still shares the slow request beyond the 2s TTL.
  const same = appsApi.list();
  expect(get).toHaveBeenCalledTimes(1);
  if (boundary === 'workspace') setActiveScopeHeader('ws:b');
  if (boundary === 'login') setTokens({ access_token: 'principal-b', expires_in: 3600 });
  // Storage can change before this tab receives a StorageEvent.
  if (boundary === 'peer-tab') localStorage.setItem('t75_token', 'principal-b');
  if (boundary === 'logout') clearTokens();
  const current = appsApi.list();
  expect(get).toHaveBeenCalledTimes(2);
  finishOld({ data: { apps: [{ id: 'old' }] } });
  expect(await old).toEqual([{ id: 'old' }]);
  expect(await same).toEqual([{ id: 'old' }]);
  expect(await current).toEqual([{ id: 'current' }]);
  expect(await appsApi.list()).toEqual([{ id: 'current' }]);
  expect(get).toHaveBeenCalledTimes(2);
});
