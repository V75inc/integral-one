import axios, { AxiosError, type AxiosAdapter } from 'axios';
import apiClient from './client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const host = vi.hoisted(() => ({ session: vi.fn(), identity: 'installation_owner' }));
vi.mock('../host/session', () => ({ getHostSession: () => host }));
import { checkSessionDeadline, clearTokens, getAccessToken, installActivityListeners, refreshAccessToken, retryHostSession, setTokens } from './session';
import { applySessionPolicy } from './sessionPolicy';
import { configureSessionRuntime, isHostManagedSession } from './sessionRuntime';
import { enableSessionRecovery, getSessionRecovery, requestSessionRecovery } from './sessionRecovery';
import { getSessionConnection } from './sessionConnection';

beforeEach(() => {
  vi.useFakeTimers();
  configureSessionRuntime({ runtime: { preset: 'local', identity: 'installation_owner' } });
  applySessionPolicy({ idle_timeout_seconds: 10, silent_refresh_activity_seconds: 0, refresh_lead_seconds: 5 });
  localStorage.clear();
  localStorage.setItem('t75_user', JSON.stringify({ id: 'owner' }));
  enableSessionRecovery('owner');
  setTokens({ access_token: 'old', expires_in: 60 });
  host.session.mockResolvedValue({ access_token: 'fresh', expires_in: 60 });
  vi.spyOn(axios, 'get').mockResolvedValue({ data: { user: { id: 'owner' } } });
});
afterEach(() => {
  clearTokens();
  configureSessionRuntime({ profile: 'server' });
  vi.restoreAllMocks();
  vi.clearAllMocks();
  vi.useRealTimers();
});

it('renews an inactive desktop with no refresh token, idle dialog, or account refresh call', async () => {
  const post = vi.spyOn(axios, 'post');
  await vi.advanceTimersByTimeAsync(55_000);
  expect(host.session).toHaveBeenCalledOnce();
  expect(getAccessToken()).toBe('fresh');
  expect(requestSessionRecovery('renew')).toBe(false);
  expect(getSessionRecovery()).toBeNull();
  expect(post).not.toHaveBeenCalled();
});
it('awaits one host exchange when concurrent requests wake after expiry', async () => {
  vi.setSystemTime(Date.now() + 120_000);
  const tokens = await Promise.all([checkSessionDeadline(), checkSessionDeadline(), refreshAccessToken()]);
  expect(tokens).toEqual(['fresh', 'fresh', 'fresh']);
  expect(host.session).toHaveBeenCalledOnce();
});
it('retains account and workspace state through a runtime outage, retries, and clears reconnecting on recovery', async () => {
  localStorage.setItem('integral.scope', 'workspace');
  host.session.mockRejectedValueOnce(new Error('runtime restarting'));
  vi.setSystemTime(Date.now() + 120_000);
  await checkSessionDeadline();
  expect(getAccessToken()).toBeNull();
  expect(getSessionConnection()).toBe('reconnecting');
  expect(getSessionRecovery()).toBeNull();
  expect(localStorage.getItem('integral.scope')).toBe('workspace');
  expect(localStorage.getItem('t75_user')).toContain('owner');
  await vi.advanceTimersByTimeAsync(5000);
  expect(getAccessToken()).toBe('fresh');
  expect(getSessionConnection()).toBeNull();
});
it('does not send a retained page to another installation owner', async () => {
  vi.mocked(axios.get).mockResolvedValue({ data: { user: { id: 'foreign' } } });
  expect(await refreshAccessToken()).toBeNull();
  expect(localStorage.getItem('t75_token')).toBe('old');
  expect(getSessionConnection()).toBe('recovery');
});
it('ignores a native response after explicit logout and stops background recovery', async () => {
  let finish!: (value: unknown) => void;
  host.session.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
  const pending = refreshAccessToken();
  await Promise.resolve();
  clearTokens();
  finish({ access_token: 'late', expires_in: 60 });
  expect(await pending).toBeNull();
  await vi.advanceTimersByTimeAsync(120_000);
  expect(await retryHostSession()).toBeNull();
  expect(getAccessToken()).toBeNull();
  expect(host.session).toHaveBeenCalledOnce();
});
it('renews on tab wake without turning visibility into activity', async () => {
  installActivityListeners();
  const activity = localStorage.getItem('t75_last_activity_at');
  vi.setSystemTime(Date.now() + 120_000);
  window.dispatchEvent(new Event('focus'));
  await vi.advanceTimersByTimeAsync(0);
  expect(getAccessToken()).toBe('fresh');
  expect(localStorage.getItem('t75_last_activity_at')).toBe(activity);
});
it('does not use desktop policy for an accounts host or explicit hosted runtime', () => {
  configureSessionRuntime({ runtime: { preset: 'hosted', identity: 'accounts' } });
  expect(isHostManagedSession()).toBe(false);
  configureSessionRuntime(null);
  host.identity = 'accounts';
  expect(isHostManagedSession()).toBe(false);
  host.identity = 'installation_owner';
});
it('bounds retry frequency while the runtime remains unavailable', async () => {
  host.session.mockRejectedValue(new Error('offline'));
  vi.setSystemTime(Date.now() + 120_000);
  await checkSessionDeadline();
  for (let i = 0; i < 10; i++) await checkSessionDeadline();
  expect(host.session).toHaveBeenCalledOnce();
  await vi.advanceTimersByTimeAsync(15_000);
  expect(host.session).toHaveBeenCalledTimes(3);
});

it('recovers a rejected local bearer once through the host, without a refresh token', async () => {
  let calls = 0;
  const adapter: AxiosAdapter = async config => {
    if (++calls === 1) throw new AxiosError('expired', undefined, config, undefined, { status: 401, data: {}, headers: {}, statusText: 'Unauthorized', config });
    expect(config.headers.Authorization).toBe('Bearer fresh');
    return { status: 200, data: { ok: true }, headers: {}, statusText: 'OK', config };
  };
  await expect(apiClient.get('/test-local', { adapter })).resolves.toMatchObject({ data: { ok: true } });
  expect(calls).toBe(2);
  expect(host.session).toHaveBeenCalledOnce();
});
it('does not dispatch or replay a mutation while its local runtime cannot renew', async () => {
  vi.setSystemTime(Date.now() + 120_000);
  host.session.mockRejectedValue(new Error('restarting'));
  const adapter = vi.fn();
  await expect(apiClient.post('/test-mutation', {}, { adapter })).rejects.toMatchObject({ code: 'ERR_CANCELED' });
  expect(adapter).not.toHaveBeenCalled();
  expect(localStorage.getItem('t75_user')).toContain('owner');
});
