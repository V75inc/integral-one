import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
const api = vi.hoisted(() => ({ notify: vi.fn(), dismiss: vi.fn() }));
vi.mock('../SystemNotificationsContext', () => ({ useSystemNotifications: () => api }));
vi.mock('../../../api/session', () => ({ retryHostSession: vi.fn(async () => 'fresh') }));
import { retryHostSession } from '../../../api/session';
import { setSessionConnection } from '../../../api/sessionConnection';
import { useHostSessionNotification } from '../useHostSessionNotification';

afterEach(() => { cleanup(); setSessionConnection(null); vi.clearAllMocks(); });
it('explains reconnection without hiding open work, retries explicitly, and clears after recovery', async () => {
  renderHook(useHostSessionNotification);
  act(() => setSessionConnection('reconnecting'));
  const banner = api.notify.mock.calls[api.notify.mock.calls.length - 1][0];
  expect(banner.title).toBe('Reconnecting to your workspace');
  expect(banner.dismissible).toBe(false);
  await act(async () => { await banner.actions[0].onClick(); });
  expect(retryHostSession).toHaveBeenCalledOnce();
  api.dismiss.mockClear();
  act(() => setSessionConnection(null));
  expect(api.dismiss).toHaveBeenCalledWith('system:local-session');
});
