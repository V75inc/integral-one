import axios, { AxiosError } from 'axios';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('../host/session', () => ({ getHostSession: () => null }));
import { renewSession } from './sessionRenewal';
import { clearTokens, setTokens } from './session';
import { enableSessionRecovery, getSessionRecovery, requestSessionRecovery } from './sessionRecovery';

beforeEach(() => {
  localStorage.clear();
  enableSessionRecovery('owner');
  setTokens({ access_token: 'old', refresh_token: 'refresh', expires_in: 60 });
  requestSessionRecovery('renew');
});
afterEach(() => { clearTokens(); enableSessionRecovery(null); vi.restoreAllMocks(); });

describe('renewal authority', () => {
  it('verifies the authoritative account before returning uninstalled credentials', async () => {
    vi.spyOn(axios, 'post').mockResolvedValue({ data: { access_token: 'new', refresh_token: 'rotated' } });
    vi.spyOn(axios, 'get').mockResolvedValue({ data: { user: { id: 'owner' } } });
    const result = await renewSession('owner');
    expect(result.user.id).toBe('owner');
    expect(axios.get).toHaveBeenCalledWith(expect.stringContaining('/auth/me'), expect.objectContaining({ headers: { Authorization: 'Bearer new' } }));
    expect(localStorage.getItem('t75_token')).toBe('old');
    expect(getSessionRecovery()).toBe('renew');
  });

  it('rejects another account without replacing stored credentials', async () => {
    vi.spyOn(axios, 'post').mockResolvedValue({ data: { access_token: 'foreign' } });
    vi.spyOn(axios, 'get').mockResolvedValue({ data: { user: { id: 'different' } } });
    await expect(renewSession('owner')).rejects.toThrow('different account');
    expect(localStorage.getItem('t75_token')).toBe('old');
  });

  it('cannot resurrect a page after sign-out while profile verification is pending', async () => {
    let resolve!: (value: unknown) => void;
    vi.spyOn(axios, 'post').mockResolvedValue({ data: { access_token: 'new' } });
    vi.spyOn(axios, 'get').mockImplementation(() => new Promise(done => { resolve = done; }));
    const pending = renewSession('owner');
    await vi.waitFor(() => expect(axios.get).toHaveBeenCalled());
    clearTokens();
    enableSessionRecovery(null);
    resolve({ data: { user: { id: 'owner' } } });
    await expect(pending).rejects.toThrow('session changed');
    expect(localStorage.getItem('t75_token')).toBeNull();
  });

  it('requires credentials after a rejected refresh and retains them after a temporary outage', async () => {
    const error = new AxiosError('unauthorized');
    error.response = { status: 401 } as never;
    vi.spyOn(axios, 'post').mockRejectedValue(error);
    await expect(renewSession('owner')).rejects.toThrow();
    expect(getSessionRecovery()).toBeNull();
    expect(localStorage.getItem('t75_refresh_token')).toBeNull();
  });
});


it('does not submit renewal after the retained access session expires', async () => {
  localStorage.setItem('t75_token_expires_at', String(Date.now() - 1));
  const post = vi.spyOn(axios, 'post');
  await expect(renewSession('owner')).rejects.toThrow('session expired');
  expect(post).not.toHaveBeenCalled();
  expect(getSessionRecovery()).toBeNull();
});

it('verifies and resumes a valid access-only session without demanding another login', async () => {
  localStorage.removeItem('t75_refresh_token');
  const post = vi.spyOn(axios, 'post');
  vi.spyOn(axios, 'get').mockResolvedValue({ data: { user: { id: 'owner' } } });
  const result = await renewSession('owner');
  expect(result.tokens.access_token).toBe('old');
  expect(result.tokens.expires_in).toBeGreaterThan(0);
  expect(post).not.toHaveBeenCalled();
});

it('does not clear a newer login after a retired renewal fails', async () => {
  let reject!: (error: unknown) => void;
  vi.spyOn(axios, 'post').mockImplementation(() => new Promise((_done, fail) => { reject = fail; }));
  const pending = renewSession('owner');
  clearTokens();
  enableSessionRecovery('new-owner');
  setTokens({ access_token: 'new-login', refresh_token: 'new-refresh', expires_in: 60 });
  const error = new AxiosError('late rejection');
  error.response = { status: 401 } as never;
  reject(error);
  await expect(pending).rejects.toThrow('late rejection');
  expect(localStorage.getItem('t75_token')).toBe('new-login');
});
