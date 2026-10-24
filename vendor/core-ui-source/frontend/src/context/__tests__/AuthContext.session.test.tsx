/**
 * Boot-time `/auth/me` must only end the session on an authoritative refusal.
 *
 * It used to `clearTokens()` on ANY rejection — offline, a 5xx, a dropped
 * connection — so a signed-in user was thrown to /login every time the
 * backend hiccupped on page load, with a perfectly valid token in hand.
 * A 401 soft-lands on login; 403 is permission (not expiry) and keeps the
 * session; anything else keeps the cached user and retries once the browser
 * comes back online or the user next interacts.
 */
import React from 'react';
import { MemoryRouter, useNavigate } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, render, renderHook, waitFor, cleanup, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

vi.mock('../../api/userTimezone', () => ({ userTimezoneApi: { set: vi.fn(async () => ({ timezone: 'America/Guyana', configured: true })) } }));

vi.mock('../../api', () => ({
  authApi: {
    me: vi.fn(),
    login: vi.fn(),
    signup: vi.fn(),
    logout: vi.fn(),
  },
}));

vi.mock('../../api/session', () => ({
  getSessionGeneration: vi.fn(() => 0),
  clearTokens: vi.fn(),
  getAccessToken: vi.fn(() => 'access-1'),
  installActivityListeners: vi.fn(),
  redirectToLogin: vi.fn(),
  refreshAccessToken: vi.fn(),
  scheduleProactiveRefresh: vi.fn(),
  setTokens: vi.fn(),
}));

vi.mock('../../features/ai-chat/threadSessionStore', () => ({
  resetThreadSessions: vi.fn(),
}));
vi.mock('../../components/system/SessionRenewalDialog', () => ({ SessionRenewalDialog: () => <div data-testid="inactivity-dialog" /> }));

import { userTimezoneApi } from '../../api/userTimezone';
import { authApi } from '../../api';
import { clearTokens, redirectToLogin, getAccessToken, getSessionGeneration } from '../../api/session';
import { AuthProvider, useAuth } from '../AuthContext';
import { getSessionRecovery, requestSessionRecovery } from '../../api/sessionRecovery';

const cachedUser = { id: 'u1', email: 'a@b.c', display_name: 'Ada' };

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={qc}>
      <MemoryRouter><AuthProvider>{children}</AuthProvider></MemoryRouter>
    </QueryClientProvider>
  );
}

function httpError(status: number) {
  return Object.assign(new Error(`HTTP ${status}`), { response: { status } });
}

beforeEach(() => {
  localStorage.setItem('t75_user', JSON.stringify(cachedUser));
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  localStorage.clear();
});

describe('AuthContext boot hydration', () => {
  it('does not enable recovery from a cached, unverified profile', async () => {
    vi.mocked(authApi.me).mockImplementation(() => new Promise(() => {}));
    let accepted: boolean | undefined;
    function PollingChild() {
      const { user } = useAuth();
      React.useEffect(() => {
        if (user) accepted = requestSessionRecovery('renew');
      }, [user]);
      return null;
    }
    render(<PollingChild />, { wrapper });
    await waitFor(() => expect(accepted).toBe(false));
    expect(getSessionRecovery()).toBeNull();
  });
  it('keeps the cached user when /auth/me fails for a non-auth reason', async () => {
    vi.mocked(authApi.me).mockRejectedValue(httpError(503));

    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(clearTokens).not.toHaveBeenCalled();
    expect(result.current.token).toBe('access-1');
    expect(result.current.user?.id).toBe('u1');
  });

  it('keeps the session when the request never reached the server', async () => {
    // A network error carries no `response` at all.
    vi.mocked(authApi.me).mockRejectedValue(new Error('Network Error'));

    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(clearTokens).not.toHaveBeenCalled();
    expect(result.current.user?.id).toBe('u1');
  });

  it('retries once the browser is back online and adopts the fresh user', async () => {
    vi.mocked(authApi.me)
      .mockRejectedValueOnce(httpError(502))
      .mockResolvedValueOnce({ ...cachedUser, display_name: 'Ada (fresh)' } as never);

    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(authApi.me).toHaveBeenCalledTimes(1);

    await act(async () => {
      window.dispatchEvent(new Event('online'));
    });

    await waitFor(() => expect(result.current.user?.display_name).toBe('Ada (fresh)'));
    expect(authApi.me).toHaveBeenCalledTimes(2);
    expect(clearTokens).not.toHaveBeenCalled();
    // The retry is one-shot: a later interaction does not keep re-fetching.
    await act(async () => {
      window.dispatchEvent(new Event('online'));
    });
    expect(authApi.me).toHaveBeenCalledTimes(2);
  });

  it('soft-lands on login on an authoritative 401', async () => {
    vi.mocked(authApi.me).mockRejectedValue(httpError(401));

    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(redirectToLogin).toHaveBeenCalledTimes(1);
    expect(result.current.token).toBeNull();
    expect(result.current.user).toBeNull();
  });

  it('does not treat a 403 as session expiry', async () => {
    vi.mocked(authApi.me).mockRejectedValue(httpError(403));

    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(redirectToLogin).not.toHaveBeenCalled();
    expect(result.current.token).toBe('access-1');
    expect(result.current.user?.display_name).toBe('Ada');
  });
});


describe('Account time zone detection', () => {
  it('infers only for an authoritative unset profile', async () => {
    vi.mocked(authApi.me).mockResolvedValue({ ...cachedUser, timezone: null } as never);
    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.user?.timezone).toBe('America/Guyana'));
    expect(userTimezoneApi.set).toHaveBeenCalledWith(expect.any(String), true);
  });
  it('keeps a manually saved zone on another device', async () => {
    vi.mocked(authApi.me).mockResolvedValue({ ...cachedUser, timezone: 'Asia/Tokyo' } as never);
    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.user?.timezone).toBe('Asia/Tokyo');
    expect(userTimezoneApi.set).not.toHaveBeenCalled();
  });
  it('does not infer from a stale cached profile while offline', async () => {
    vi.mocked(authApi.me).mockRejectedValue(new Error('offline'));
    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(userTimezoneApi.set).not.toHaveBeenCalled();
  });
});


it('updates token consumers after silent renewal and another tab renewal', async () => {
  vi.mocked(authApi.me).mockResolvedValue(cachedUser as never);
  const {result}=renderHook(()=>useAuth(),{wrapper});
  await waitFor(()=>expect(result.current.loading).toBe(false));
  vi.mocked(getAccessToken).mockReturnValue('renewed-access');
  act(()=>window.dispatchEvent(new Event('integral:tokens-updated')));
  expect(result.current.token).toBe('renewed-access');
  vi.mocked(getAccessToken).mockReturnValue('shared-access');
  act(()=>window.dispatchEvent(new StorageEvent('storage',{key:'t75_token',newValue:'shared-access'})));
  expect(result.current.token).toBe('shared-access');
  expect(result.current.user?.id).toBe('u1');
  vi.mocked(getAccessToken).mockReturnValue('access-1');
});


it('enables inactivity recovery only after profile verification, and removes it on public navigation', async () => {
  vi.mocked(authApi.me).mockResolvedValue(cachedUser as never);
  let navigate!: ReturnType<typeof useNavigate>;
  function RouterProbe() { navigate = useNavigate(); return null; }
  render(<RouterProbe />, { wrapper });
  await waitFor(() => expect(authApi.me).toHaveBeenCalled());
  await waitFor(() => {
    act(() => { expect(requestSessionRecovery('renew')).toBe(true); });
  });
  expect(screen.getByTestId('inactivity-dialog')).toBeInTheDocument();
  act(() => navigate('/login'));
  expect(screen.queryByTestId('inactivity-dialog')).not.toBeInTheDocument();
  expect(getSessionRecovery()).toBeNull();
  expect(requestSessionRecovery('renew')).toBe(false);
});

it('does not restore a cached account from a late hydration response after logout', async () => {
  let resolve!: (user: never) => void;
  vi.mocked(authApi.me).mockImplementation(() => new Promise(done => { resolve = done; }));
  const { result } = renderHook(() => useAuth(), { wrapper });
  await waitFor(() => expect(authApi.me).toHaveBeenCalled());
  vi.mocked(getSessionGeneration).mockReturnValue(1);
  act(() => window.dispatchEvent(new Event('integral:logout')));
  await act(async () => resolve(cachedUser as never));
  expect(result.current.user).toBeNull();
  expect(result.current.token).toBeNull();
  vi.mocked(getSessionGeneration).mockReturnValue(0);
});

it('retires the local account immediately while remote signout is still pending', async () => {
  vi.mocked(authApi.me).mockResolvedValue(cachedUser as never);
  let finish!: (value: never) => void;
  vi.mocked(authApi.logout).mockImplementation(() => new Promise(done => { finish = done; }));
  localStorage.setItem('t75_token', 'captured-token');
  const { result } = renderHook(() => useAuth(), { wrapper });
  await waitFor(() => expect(result.current.loading).toBe(false));
  let pending!: Promise<void>;
  act(() => { pending = result.current.logout(); });
  expect(result.current.user).toBeNull();
  expect(result.current.token).toBeNull();
  expect(requestSessionRecovery('renew')).toBe(false);
  await waitFor(() => expect(authApi.logout).toHaveBeenCalledWith('captured-token'));
  await act(async () => { finish(undefined as never); await pending; });
});
