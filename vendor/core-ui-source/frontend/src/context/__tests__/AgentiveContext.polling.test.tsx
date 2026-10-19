/**
 * Polling behaviour for the `/agentive/status` wait-for-native provider loop.
 *
 * The interval only runs while agentive is enabled but no agent has connected
 * yet — which, if native provider never registers, is indefinitely. It previously ran
 * regardless of tab visibility, so a backgrounded tab kept issuing requests
 * whose result it could not display.
 *
 * It also re-fired off-cadence: `refresh` depends on `user`, and AuthProvider
 * used to mint a fresh context value (and therefore a fresh `user` reference)
 * on every render, tearing down and re-establishing this effect. That is fixed
 * in AuthContext by memoizing the provider value; this file covers the
 * visibility half.
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';

vi.mock('../../api/agentive', () => ({
  getAgentiveStatus: vi.fn(),
}));
vi.mock('../AuthContext', () => ({
  useAuth: vi.fn(() => ({ user: { id: 'user-1' }, loading: false })),
}));

import * as agentiveClient from '../../api/agentive';
import { AgentiveProvider, useAgentive } from '../AgentiveContext';

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <AgentiveProvider>{children}</AgentiveProvider>
);

/** enabled + not connected = the state that arms the poll. */
const WAITING = { enabled: true, agent_connected: false };

function setVisibility(state: 'visible' | 'hidden') {
  Object.defineProperty(document, 'visibilityState', {
    configurable: true,
    get: () => state,
  });
  document.dispatchEvent(new Event('visibilitychange'));
}

describe('AgentiveContext polling', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setVisibility('visible');
    vi.mocked(agentiveClient.getAgentiveStatus).mockResolvedValue(
      WAITING as never,
    );
  });

  afterEach(() => {
    vi.useRealTimers();
    setVisibility('visible');
  });

  it('polls while waiting for an agent to connect', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { result } = renderHook(() => useAgentive(), { wrapper });
    await waitFor(() => expect(result.current.enabled).toBe(true));

    const afterInitial = vi.mocked(agentiveClient.getAgentiveStatus).mock.calls
      .length;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(12_000);
    });

    expect(
      vi.mocked(agentiveClient.getAgentiveStatus).mock.calls.length,
    ).toBeGreaterThan(afterInitial);
  });

  it('stops polling while the tab is hidden', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { result } = renderHook(() => useAgentive(), { wrapper });
    await waitFor(() => expect(result.current.enabled).toBe(true));

    act(() => setVisibility('hidden'));
    const whenHidden = vi.mocked(agentiveClient.getAgentiveStatus).mock.calls
      .length;

    await act(async () => {
      await vi.advanceTimersByTimeAsync(36_000); // three intervals
    });

    expect(vi.mocked(agentiveClient.getAgentiveStatus).mock.calls.length).toBe(
      whenHidden,
    );
  });

  it('refreshes immediately when the tab becomes visible again', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { result } = renderHook(() => useAgentive(), { wrapper });
    await waitFor(() => expect(result.current.enabled).toBe(true));

    act(() => setVisibility('hidden'));
    const whenHidden = vi.mocked(agentiveClient.getAgentiveStatus).mock.calls
      .length;

    await act(async () => {
      setVisibility('visible');
    });

    // Does not wait out the remaining interval before showing fresh state.
    await waitFor(() =>
      expect(
        vi.mocked(agentiveClient.getAgentiveStatus).mock.calls.length,
      ).toBeGreaterThan(whenHidden),
    );
  });

  it('does not arm the poll once an agent is connected', async () => {
    vi.mocked(agentiveClient.getAgentiveStatus).mockResolvedValue({
      enabled: true,
      agent_connected: true,
    } as never);
    vi.useFakeTimers({ shouldAdvanceTime: true });

    const { result } = renderHook(() => useAgentive(), { wrapper });
    await waitFor(() => expect(result.current.agentConnected).toBe(true));

    const settled = vi.mocked(agentiveClient.getAgentiveStatus).mock.calls
      .length;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(36_000);
    });

    expect(vi.mocked(agentiveClient.getAgentiveStatus).mock.calls.length).toBe(
      settled,
    );
  });
});
