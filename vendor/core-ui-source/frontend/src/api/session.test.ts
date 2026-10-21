import axios from 'axios';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearTokens, getAccessToken, getRefreshToken, pauseForSessionRenewal, refreshAccessToken, setTokens, markActivity, checkSessionDeadline } from './session';
import { applySessionPolicy, getSessionPolicy } from './sessionPolicy';
import { enableSessionRecovery, getSessionRecovery } from './sessionRecovery';

beforeEach(() => {
  vi.useFakeTimers();
  applySessionPolicy({});
  localStorage.clear();
  enableSessionRecovery('owner');
});
afterEach(() => {
  clearTokens();
  enableSessionRecovery(null);
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('session renewal lifecycle', () => {
  it('uses the extended defaults and validates deployment timing bounds', () => {
    expect(getSessionPolicy().access_token_ttl_seconds).toBe(3600);
    expect(getSessionPolicy().silent_refresh_activity_seconds).toBe(900);
    applySessionPolicy({ idle_timeout_seconds: -1, renewal_request_timeout_seconds: 0, silent_refresh_activity_seconds: 1200 });
    expect(getSessionPolicy().idle_timeout_seconds).toBe(0);
    expect(getSessionPolicy().renewal_request_timeout_seconds).toBe(20);
    expect(getSessionPolicy().silent_refresh_activity_seconds).toBe(1200);
  });

  it('locks after configured inactivity and a wake-up click cannot reset the deadline', async () => {
    applySessionPolicy({ idle_timeout_seconds: 60 });
    setTokens({ access_token: 'access', refresh_token: 'refresh', expires_in: 3600 });
    vi.setSystemTime(Date.now() + 60_001);
    markActivity();
    expect(getSessionRecovery()).toBe('renew');
    expect(getAccessToken()).toBeNull();
    expect(getRefreshToken()).toBe('refresh');
  });

  it('re-arms silent renewal when activity resumes before token expiry', async () => {
    const post = vi.spyOn(axios, 'post').mockResolvedValue({ data: { access_token: 'renewed', refresh_token: 'rotated', expires_in: 3600 } });
    setTokens({ access_token: 'access', refresh_token: 'refresh', expires_in: 3600 });
    await vi.advanceTimersByTimeAsync(3_480_000);
    expect(post).not.toHaveBeenCalled();
    markActivity();
    await vi.advanceTimersByTimeAsync(30_000);
    expect(post).toHaveBeenCalledTimes(1);
    expect(getSessionRecovery()).toBeNull();
  });

  it('background renewal preserves the human activity deadline', async () => {
    applySessionPolicy({ idle_timeout_seconds: 120 });
    setTokens({ access_token: 'access', refresh_token: 'refresh', expires_in: 3600 });
    await vi.advanceTimersByTimeAsync(60_000);
    vi.spyOn(axios, 'post').mockResolvedValue({ data: { access_token: 'renewed', expires_in: 3600 } });
    expect(await refreshAccessToken()).toBe('renewed');
    await vi.advanceTimersByTimeAsync(60_000);
    checkSessionDeadline();
    expect(getSessionRecovery()).toBe('renew');
  });

  it('locks at expiry, retains the refresh token and does not count polling as activity', async () => {
    const post = vi.spyOn(axios, 'post').mockResolvedValue({ data: { access_token: 'renewed' } });
    setTokens({ access_token: 'access', refresh_token: 'refresh', expires_in: 3600 });
    await vi.advanceTimersByTimeAsync(3_600_000);
    expect(post).not.toHaveBeenCalled();
    expect(getSessionRecovery()).toBe('renew');
    expect(getAccessToken()).toBeNull();
    expect(getRefreshToken()).toBe('refresh');
  });

  it('requires credentials after an authoritative refresh rejection without discarding page scope', async () => {
    localStorage.setItem('t75_user', JSON.stringify({ id: 'owner' }));
    localStorage.setItem('integral.scope', 'retained');
    setTokens({ access_token: 'access', refresh_token: 'refresh', expires_in: 60 });
    vi.spyOn(axios, 'post').mockRejectedValue({ response: { status: 401 } });
    expect(await refreshAccessToken()).toBeNull();
    expect(getSessionRecovery()).toBe('signin');
    expect(getRefreshToken()).toBeNull();
    expect(getAccessToken()).toBeNull();
    expect(localStorage.getItem('integral.scope')).toBe('retained');
  });

  it.each([429, 503])('retains renewable credentials after HTTP %s', async status => {
    setTokens({ access_token: 'access', refresh_token: 'refresh', expires_in: 60 });
    vi.spyOn(axios, 'post').mockRejectedValue({ response: { status } });
    expect(await refreshAccessToken()).toBeNull();
    pauseForSessionRenewal();
    expect(getSessionRecovery()).toBe('renew');
    expect(getRefreshToken()).toBe('refresh');
  });

  it('discards a refresh response arriving after explicit sign-out', async () => {
    let resolve!: (value: unknown) => void;
    vi.spyOn(axios, 'post').mockImplementation(() => new Promise(done => { resolve = done; }));
    setTokens({ access_token: 'access', refresh_token: 'refresh', expires_in: 60 });
    const pending = refreshAccessToken();
    clearTokens();
    resolve({ data: { access_token: 'late', refresh_token: 'late-refresh' } });
    expect(await pending).toBeNull();
    expect(localStorage.getItem('t75_token')).toBeNull();
  });
});
