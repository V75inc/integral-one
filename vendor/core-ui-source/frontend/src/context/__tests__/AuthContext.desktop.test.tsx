import React from 'react';
import axios from 'axios';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const host = vi.hoisted(() => ({ identity: 'installation_owner', session: vi.fn() }));
vi.mock('../../host/session', () => ({ getHostSession: () => host }));
vi.mock('../../api', () => ({ authApi: { me: vi.fn(async () => ({ id: 'owner', timezone: 'America/Guyana' })) } }));
vi.mock('../../api/sessionPolicy', async original => ({ ...await original<object>(), loadSessionPolicy: async () => {} }));
vi.mock('../../features/ai-chat/threadSessionStore', () => ({ resetThreadSessions: vi.fn() }));
import { AuthProvider, useAuth } from '../AuthContext';
import { configureSessionRuntime } from '../../api/sessionRuntime';
import { applySessionPolicy } from '../../api/sessionPolicy';
import { clearTokens, setTokens } from '../../api/session';
import { getSessionConnection } from '../../api/sessionConnection';

beforeEach(() => {
  vi.useFakeTimers();
  localStorage.clear();
  configureSessionRuntime({ profile: 'desktop_single_user' });
  applySessionPolicy({ idle_timeout_seconds: 1, silent_refresh_activity_seconds: 0, refresh_lead_seconds: 1 });
  setTokens({ access_token: 'initial', expires_in: 3 });
  host.session.mockResolvedValue({ access_token: 'fresh', expires_in: 3 });
  vi.spyOn(axios, 'get').mockResolvedValue({ data: { user: { id: 'owner' } } });
});
afterEach(() => { cleanup(); clearTokens(); configureSessionRuntime({ profile: 'server' }); vi.restoreAllMocks(); vi.clearAllMocks(); vi.useRealTimers(); });
function Probe() {
  const { user } = useAuth();
  return <><span>{user?.id ?? 'opening'}</span><textarea aria-label="Draft" /></>;
}
it('keeps the authenticated page and its draft mounted through expiry and host recovery', async () => {
  render(<MemoryRouter><QueryClientProvider client={new QueryClient()}><AuthProvider><Probe /></AuthProvider></QueryClientProvider></MemoryRouter>);
  await act(async () => { await vi.advanceTimersByTimeAsync(0); });
  expect(screen.getByText('owner')).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('Draft'), { target: { value: 'Unsent work' } });
  host.session.mockRejectedValue(new Error('runtime restarting'));
  await act(async () => { await vi.advanceTimersByTimeAsync(4000); });
  expect(screen.getByText('owner')).toBeInTheDocument();
  expect(screen.getByLabelText('Draft')).toHaveValue('Unsent work');
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(getSessionConnection()).toBe('reconnecting');
  host.session.mockResolvedValue({ access_token: 'recovered', expires_in: 60 });
  await act(async () => { await vi.advanceTimersByTimeAsync(5000); });
  expect(getSessionConnection()).toBeNull();
  expect(screen.getByLabelText('Draft')).toHaveValue('Unsent work');
});
