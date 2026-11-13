import axios from 'axios';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { configureSessionRuntime } from '../api/sessionRuntime';
import { getSessionConnection } from '../api/sessionConnection';
import { clearTokens, getAccessToken, installActivityListeners, setTokens } from '../api/session';

// Exercise the real One host adapter, not Core's mocked adapter. A generic Core
// UI can initially work with cached tokens but cannot renew the native session.
beforeEach(() => {
  vi.useFakeTimers();
  localStorage.clear();
  configureSessionRuntime({ runtime: { preset: 'local', identity: 'installation_owner' } });
  localStorage.setItem('t75_user', JSON.stringify({ id: 'owner' }));
  vi.spyOn(axios, 'get').mockResolvedValue({ data: { user: { id: 'owner' } } });
  installActivityListeners();
});

afterEach(() => {
  clearTokens();
  configureSessionRuntime({ profile: 'server' });
  delete window.integralDesktop;
  vi.restoreAllMocks();
  vi.useRealTimers();
});

it('renews through the actual native bridge after returning with an expired cached token', async () => {
  const session = vi.fn().mockResolvedValue({ access_token: 'renewed-owner', expires_in: 60 });
  window.integralDesktop = { session };
  localStorage.setItem('integral.scope', 'retained-workspace');
  setTokens({ access_token: 'cached-owner', expires_in: 60 });
  vi.setSystemTime(Date.now() + 120_000);
  window.dispatchEvent(new Event('focus'));
  await vi.advanceTimersByTimeAsync(0);
  expect(session).toHaveBeenCalledOnce();
  expect(getAccessToken()).toBe('renewed-owner');
  expect(getSessionConnection()).toBeNull();
  expect(localStorage.getItem('integral.scope')).toBe('retained-workspace');
});
