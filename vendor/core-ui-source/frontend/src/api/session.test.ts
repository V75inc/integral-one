import axios from 'axios';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearTokens, getAccessToken, getRefreshToken, pauseForSessionRenewal, refreshAccessToken, setTokens, markActivity, checkSessionDeadline, installActivityListeners } from './session';
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

  it('ends an expired idle session without showing an inactivity prompt', async () => {
    const post = vi.spyOn(axios, 'post').mockResolvedValue({ data: { access_token: 'renewed' } });
    setTokens({ access_token: 'access', refresh_token: 'refresh', expires_in: 3600 });
    await vi.advanceTimersByTimeAsync(3_600_000);
    expect(post).not.toHaveBeenCalled();
    expect(getSessionRecovery()).toBeNull();
    expect(getAccessToken()).toBeNull();
    expect(getRefreshToken()).toBeNull();
  });

  it('ends the session after an authoritative refresh rejection', async () => {
    localStorage.setItem('t75_user', JSON.stringify({ id: 'owner' }));
    localStorage.setItem('integral.scope', 'retained');
    setTokens({ access_token: 'access', refresh_token: 'refresh', expires_in: 60 });
    vi.spyOn(axios, 'post').mockRejectedValue({ response: { status: 401 } });
    expect(await refreshAccessToken()).toBeNull();
    expect(getSessionRecovery()).toBeNull();
    expect(getRefreshToken()).toBeNull();
    expect(getAccessToken()).toBeNull();
    expect(localStorage.getItem('integral.scope')).toBeNull();
  });

  it.each([429, 503])('retains renewable credentials after HTTP %s', async status => {
    setTokens({ access_token: 'access', refresh_token: 'refresh', expires_in: 60 });
    vi.spyOn(axios, 'post').mockRejectedValue({ response: { status } });
    expect(await refreshAccessToken()).toBeNull();
    pauseForSessionRenewal();
    expect(getSessionRecovery()).toBeNull();
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

describe('active session continuity', () => {
  it('silently renews a recently active session when a throttled timer misses expiry', async () => {
    vi.spyOn(axios, 'post').mockResolvedValue({data:{access_token:'renewed',refresh_token:'rotated',expires_in:3600}});
    setTokens({access_token:'access',refresh_token:'refresh',expires_in:3600});
    vi.setSystemTime(Date.now()+3_599_000);
    markActivity();
    vi.setSystemTime(Date.now()+2000);
    await checkSessionDeadline();
    expect(getSessionRecovery()).toBeNull();
    expect(getAccessToken()).toBe('renewed');
  });
  it('does not lock an active page while its renewal crosses access expiry', async () => {
    applySessionPolicy({refresh_lead_seconds:2,min_refresh_interval_seconds:1});
    let resolve!: (value: unknown) => void;
    vi.spyOn(axios,'post').mockImplementation(()=>new Promise(done=>{resolve=done;}));
    setTokens({access_token:'access',refresh_token:'refresh',expires_in:10});
    await vi.advanceTimersByTimeAsync(7000);
    markActivity();
    await vi.advanceTimersByTimeAsync(3000);
    const atExpiry = getSessionRecovery();
    resolve({data:{access_token:'renewed',refresh_token:'rotated',expires_in:60}});
    await vi.advanceTimersByTimeAsync(0);
    expect(atExpiry).toBeNull();
    expect(getAccessToken()).toBe('renewed');
  });
  it('retries a transient proactive renewal failure while access remains valid', async () => {
    applySessionPolicy({refresh_lead_seconds:10,min_refresh_interval_seconds:5});
    const post=vi.spyOn(axios,'post').mockRejectedValueOnce({response:{status:503}}).mockResolvedValueOnce({data:{access_token:'renewed',refresh_token:'rotated',expires_in:60}});
    setTokens({access_token:'access',refresh_token:'refresh',expires_in:60});
    await vi.advanceTimersByTimeAsync(45_000);
    markActivity();
    await vi.advanceTimersByTimeAsync(5000);
    expect(getSessionRecovery()).toBeNull();
    expect(getAccessToken()).toBe('access');
    await vi.advanceTimersByTimeAsync(5000);
    expect(post).toHaveBeenCalledTimes(2);
    expect(getAccessToken()).toBe('renewed');
  });
});

describe('refresh rotation and account boundaries', () => {
  it('adopts a completed same-account rotation while waiting for the cross-tab lock', async () => {
    const post = vi.spyOn(axios,'post');
    localStorage.setItem('t75_user',JSON.stringify({id:'owner'}));
    setTokens({access_token:'old',refresh_token:'old-refresh',expires_in:60});
    const request=vi.fn(async (_name, _options, run) => {
      localStorage.setItem('t75_token','shared-access');
      localStorage.setItem('t75_refresh_token','shared-refresh');
      localStorage.setItem('t75_token_expires_at',String(Date.now()+60_000));
      return run();
    });
    vi.stubGlobal('navigator',{locks:{request}});
    try {
      expect(await refreshAccessToken()).toBe('shared-access');
      expect(request).toHaveBeenCalledOnce();
      expect(post).not.toHaveBeenCalled();
      expect(getSessionRecovery()).toBeNull();
    } finally { vi.unstubAllGlobals(); }
  });
  it('does not mistake a stale refresh rejection for logout when another tab has renewed', async () => {
    localStorage.setItem('t75_user',JSON.stringify({id:'owner'}));
    setTokens({access_token:'old',refresh_token:'old-refresh',expires_in:60});
    vi.spyOn(axios,'post').mockImplementation(async()=>{
      localStorage.setItem('t75_token','shared-access');
      localStorage.setItem('t75_refresh_token','shared-refresh');
      localStorage.setItem('t75_token_expires_at',String(Date.now()+60_000));
      throw {response:{status:401}};
    });
    expect(await refreshAccessToken()).toBe('shared-access');
    expect(getSessionRecovery()).toBeNull();
  });
  it('cannot replace a newly signed-in session with a late renewal response', async () => {
    let resolve!: (value: unknown) => void;
    setTokens({access_token:'old',refresh_token:'old-refresh',expires_in:60});
    vi.spyOn(axios,'post').mockImplementation(()=>new Promise(done=>{resolve=done;}));
    const pending=refreshAccessToken();
    setTokens({access_token:'different-login',refresh_token:'different-refresh',expires_in:60});
    resolve({data:{access_token:'late',refresh_token:'late-refresh',expires_in:60}});
    expect(await pending).toBeNull();
    expect(getAccessToken()).toBe('different-login');
  });
});


describe('inactivity session boundaries', () => {
  it.each(['/login', '/signup', '/forgot-password', '/reset-password', '/verify-email', '/credentials-delivery-verify.html', '/public/tracks/shared'])('does not lock the public page %s with stale credentials', async path => {
    window.history.replaceState({}, '', path);
    try {
      applySessionPolicy({ idle_timeout_seconds: 60 });
      setTokens({ access_token: 'access', refresh_token: 'refresh', expires_in: 3600 });
      await vi.advanceTimersByTimeAsync(61_000);
      markActivity();
      pauseForSessionRenewal();
      expect(getSessionRecovery()).toBeNull();
    } finally { window.history.replaceState({}, '', '/'); }
  });

  it('cannot lock or record activity after logout, even when the timer deadline passes', async () => {
    applySessionPolicy({ idle_timeout_seconds: 60 });
    setTokens({ access_token: 'access', expires_in: 3600 });
    clearTokens();
    await vi.advanceTimersByTimeAsync(61_000);
    markActivity();
    pauseForSessionRenewal();
    expect(getSessionRecovery()).toBeNull();
    expect(localStorage.getItem('t75_last_activity_at')).toBeNull();
  });

  it('expires a session while the inactivity lock is open', async () => {
    applySessionPolicy({ idle_timeout_seconds: 60 });
    setTokens({ access_token: 'access', refresh_token: 'refresh', expires_in: 120 });
    await vi.advanceTimersByTimeAsync(60_000);
    expect(getSessionRecovery()).toBe('renew');
    await vi.advanceTimersByTimeAsync(60_000);
    expect(getSessionRecovery()).toBeNull();
    expect(getAccessToken()).toBeNull();
    expect(getRefreshToken()).toBeNull();
  });

  it('gives expiry precedence over a missed idle deadline', () => {
    applySessionPolicy({ idle_timeout_seconds: 60 });
    setTokens({ access_token: 'access', expires_in: 120 });
    vi.setSystemTime(Date.now() + 121_000);
    markActivity();
    expect(getSessionRecovery()).toBeNull();
    expect(getAccessToken()).toBeNull();
  });

  it('does not treat tab visibility as human activity', async () => {
    installActivityListeners();
    setTokens({ access_token: 'access', expires_in: 3600 });
    const activity = localStorage.getItem('t75_last_activity_at');
    await vi.advanceTimersByTimeAsync(10_000);
    document.dispatchEvent(new Event('visibilitychange'));
    expect(localStorage.getItem('t75_last_activity_at')).toBe(activity);
  });

  it('does not inherit a previous login refresh token', () => {
    setTokens({ access_token: 'old', refresh_token: 'old-refresh', expires_in: 60 });
    setTokens({ access_token: 'new', expires_in: 60 });
    expect(getRefreshToken()).toBeNull();
  });
});

it('keeps an expiry watchdog after a pending refresh completes behind the idle lock', async () => {
  applySessionPolicy({ idle_timeout_seconds: 10 });
  setTokens({ access_token: 'old', refresh_token: 'refresh', expires_in: 60 });
  let resolve!: (value: unknown) => void;
  vi.spyOn(axios, 'post').mockImplementation(() => new Promise(done => { resolve = done; }));
  const pending = refreshAccessToken();
  await vi.advanceTimersByTimeAsync(10_000);
  expect(getSessionRecovery()).toBe('renew');
  resolve({ data: { access_token: 'new', refresh_token: 'rotated', expires_in: 30 } });
  await pending;
  expect(getSessionRecovery()).toBe('renew');
  await vi.advanceTimersByTimeAsync(30_000);
  expect(getSessionRecovery()).toBeNull();
  expect(getAccessToken()).toBeNull();
});
