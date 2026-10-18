import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';

// Mock the agentive client BEFORE importing the context module.
vi.mock('../api/agentive', () => ({
  getAgentiveStatus: vi.fn(),
}));

vi.mock('./AuthContext', () => ({
  useAuth: vi.fn(() => ({
    user: { id: 'user-1' },
    loading: false,
  })),
}));

import * as agentiveClient from '../api/agentive';
import { useAuth } from './AuthContext';
import { AgentiveProvider, useAgentive } from './AgentiveContext';

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <AgentiveProvider>{children}</AgentiveProvider>
);

describe('AgentiveContext', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useAuth).mockReturnValue({
      user: { id: 'user-1' } as ReturnType<typeof useAuth>['user'],
      loading: false,
    } as ReturnType<typeof useAuth>);
  });

  it('does not call getAgentiveStatus while unauthenticated', async () => {
    vi.mocked(useAuth).mockReturnValue({
      user: null,
      loading: false,
    } as ReturnType<typeof useAuth>);

    renderHook(() => useAgentive(), { wrapper });
    await waitFor(() => {
      expect(agentiveClient.getAgentiveStatus).not.toHaveBeenCalled();
    });
  });

  it('settles to {enabled: false, agentConnected: false} on 404 from getAgentiveStatus', async () => {
    (agentiveClient.getAgentiveStatus as ReturnType<typeof vi.fn>).mockRejectedValue(
      { response: { status: 404 } },
    );

    const { result } = renderHook(() => useAgentive(), { wrapper });
    await waitFor(() => {
      expect(result.current.enabled).toBe(false);
      expect(result.current.agentConnected).toBe(false);
    });
  });

  it('settles to {enabled: true, agentConnected: true} on happy-path response', async () => {
    (agentiveClient.getAgentiveStatus as ReturnType<typeof vi.fn>).mockResolvedValue({
      enabled: true,
      agent_connected: true,
    });

    const { result } = renderHook(() => useAgentive(), { wrapper });
    await waitFor(() => {
      expect(result.current.enabled).toBe(true);
      expect(result.current.agentConnected).toBe(true);
    });
  });

  it('refresh() re-polls getAgentiveStatus', async () => {
    const mock = agentiveClient.getAgentiveStatus as ReturnType<typeof vi.fn>;
    // Resolve with enabled:true / agent_connected:true so the polling effect
    // does NOT install its 12s setInterval (which would race the assertion).
    mock.mockResolvedValue({ enabled: true, agent_connected: true });

    const { result } = renderHook(() => useAgentive(), { wrapper });
    await waitFor(() => expect(result.current.enabled).toBe(true));

    const callsBefore = mock.mock.calls.length;
    act(() => {
      result.current.refresh?.();
    });
    await waitFor(() => {
      expect(mock.mock.calls.length).toBeGreaterThan(callsBefore);
    });
  });

  // ──────────────────────────────────────────────────────────────────────
  // Plan 07-05 TEST-04 augmentation — additional edge-case coverage per
  // CONTEXT lock. Provider error-path propagation + intermediate states.
  // ──────────────────────────────────────────────────────────────────────

  it('settles to {enabled: false, agentConnected: false} on a generic API throw', async () => {
    (agentiveClient.getAgentiveStatus as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('network unreachable'),
    );
    const { result } = renderHook(() => useAgentive(), { wrapper });
    await waitFor(() => {
      expect(result.current.enabled).toBe(false);
      expect(result.current.agentConnected).toBe(false);
    });
  });

  it('handles {enabled: true, agent_connected: false} as partial-connect', async () => {
    // Half-enabled state — flag on, runtime disconnected. UI must
    // distinguish so chat surfaces stay non-functional while the
    // status panel reflects the partial state.
    (agentiveClient.getAgentiveStatus as ReturnType<typeof vi.fn>).mockResolvedValue({
      enabled: true,
      agent_connected: false,
    });
    const { result } = renderHook(() => useAgentive(), { wrapper });
    await waitFor(() => {
      expect(result.current.enabled).toBe(true);
      expect(result.current.agentConnected).toBe(false);
    });
  });

  it('refresh() is idempotent (multiple calls do not crash)', async () => {
    const mock = agentiveClient.getAgentiveStatus as ReturnType<typeof vi.fn>;
    mock.mockResolvedValue({ enabled: true, agent_connected: true });
    const { result } = renderHook(() => useAgentive(), { wrapper });
    await waitFor(() => expect(result.current.enabled).toBe(true));
    const callsBefore = mock.mock.calls.length;
    act(() => {
      result.current.refresh?.();
      result.current.refresh?.();
      result.current.refresh?.();
    });
    await waitFor(() => {
      expect(mock.mock.calls.length).toBeGreaterThan(callsBefore);
    });
  });
});
