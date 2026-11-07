/**
 * The inbox exists to end a specific class of bug: two surfaces disagreeing
 * about whether anything is waiting on you. The tests here pin the three
 * decisions that make it trustworthy —
 *
 *   1. what the badge counts (and what it deliberately does not),
 *   2. that one dead endpoint degrades rather than blanks the view,
 *   3. that a decision made elsewhere refreshes it.
 *
 * Get any of those wrong and the inbox becomes another surface to disbelieve.
 */

import React from 'react';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

vi.mock('../../../../api/agentive', () => ({
  listPendingStagedChanges: vi.fn(),
}));
vi.mock('../../../../api/approvals', () => ({
  listApprovals: vi.fn(),
}));
vi.mock('../../../../api/routines', () => ({
  listRoutines: vi.fn(),
}));

import * as agentive from '../../../../api/agentive';
import * as approvals from '../../../../api/approvals';
import * as routines from '../../../../api/routines';
import { useAgentInbox } from '../useAgentInbox';

function stagedChange(token: string, state = 'pending') {
  return {
    _kind: 'staged_change',
    token,
    kind: 'create_entry',
    state,
    summary: `staged ${token}`,
    diff_human: '',
    diff_machine: {},
    created_at: new Date(0).toISOString(),
    expires_at: new Date(0).toISOString(),
    autonomy_grant_used: false,
  };
}

function approval(id: string) {
  return {
    id,
    action: 'entry.create',
    resource_kind: 'entry',
    status: 'pending',
    created_at: new Date(0).toISOString(),
  };
}

function routine(id: string) {
  return {
    id,
    instruction: `routine ${id}`,
    status: 'scheduled',
    next_run_at: new Date(0).toISOString(),
  };
}

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  vi.mocked(agentive.listPendingStagedChanges).mockResolvedValue([] as never);
  vi.mocked(approvals.listApprovals).mockResolvedValue({
    approvals: [],
  } as never);
  vi.mocked(routines.listRoutines).mockResolvedValue({ routines: [] } as never);
});

afterEach(() => vi.clearAllMocks());

describe('useAgentInbox — what the badge counts', () => {
  it('counts staged changes and policy approvals together', async () => {
    vi.mocked(agentive.listPendingStagedChanges).mockResolvedValue([
      stagedChange('tok-1'),
      stagedChange('tok-2'),
    ] as never);
    vi.mocked(approvals.listApprovals).mockResolvedValue({
      approvals: [approval('ap-1')],
    } as never);

    const { result } = renderHook(() => useAgentInbox(), { wrapper });
    await waitFor(() => expect(result.current.actionableCount).toBe(3));
  });

  it('lists scheduled routines but never counts them', async () => {
    // A routine running on its own schedule is status, not a request. A badge
    // that lights up for work nobody asked you to do teaches people to ignore
    // the badge — which is exactly what the badge must not do.
    vi.mocked(routines.listRoutines).mockResolvedValue({
      routines: [routine('r-1'), routine('r-2')],
    } as never);

    const { result } = renderHook(() => useAgentInbox(), { wrapper });
    await waitFor(() => expect(result.current.routines).toHaveLength(2));
    expect(result.current.actionableCount).toBe(0);
  });

  it('keeps a blessed change whose write has not landed, drops terminal ones', async () => {
    // Found live: approving from the inbox blessed the token, the backend
    // executor refused with 403 insufficient_permissions, and the row vanished
    // as though the track had been created. `blessed` means approved, not
    // applied — the work is still owed, so it stays counted. Only `consumed`
    // and `revoked` are actually finished.
    vi.mocked(agentive.listPendingStagedChanges).mockResolvedValue([
      stagedChange('tok-1'),
      stagedChange('tok-blessed', 'blessed'),
      stagedChange('tok-2', 'consumed'),
      stagedChange('tok-3', 'revoked'),
    ] as never);

    const { result } = renderHook(() => useAgentInbox(), { wrapper });
    await waitFor(() => expect(result.current.actionableCount).toBe(2));
    expect(result.current.staged.map((s) => s.token)).toEqual([
      'tok-1',
      'tok-blessed',
    ]);
  });
});

describe('useAgentInbox — degraded rather than blank', () => {
  it('still shows a pending approval when the routines endpoint is down', async () => {
    // The failure mode this prevents: one broken source hiding a real
    // decision, which is the disagreement-between-surfaces bug all over again.
    vi.mocked(routines.listRoutines).mockRejectedValue(new Error('boom'));
    vi.mocked(approvals.listApprovals).mockResolvedValue({
      approvals: [approval('ap-1')],
    } as never);

    const { result } = renderHook(() => useAgentInbox(), { wrapper });
    await waitFor(() => expect(result.current.degraded).toBe(true));
    expect(result.current.approvals).toHaveLength(1);
    expect(result.current.actionableCount).toBe(1);
  });
});

describe('useAgentInbox — staying in sync', () => {
  it('coalesces a burst of graph events and still refreshes the inbox', async () => {
    const { result } = renderHook(() => useAgentInbox(), { wrapper });
    await waitFor(() => expect(agentive.listPendingStagedChanges).toHaveBeenCalledTimes(1));
    vi.mocked(agentive.listPendingStagedChanges).mockResolvedValue([stagedChange('new')] as never);
    act(() => {
      for (let i = 0; i < 40; i += 1) window.dispatchEvent(new Event('integral:graph-changed'));
    });
    await waitFor(() => expect(result.current.actionableCount).toBe(1));
    expect(agentive.listPendingStagedChanges).toHaveBeenCalledTimes(2);
  });

  it('catches up on proposals missed while disconnected', async () => {
    const { result } = renderHook(() => useAgentInbox(), { wrapper });
    await waitFor(() => expect(agentive.listPendingStagedChanges).toHaveBeenCalledTimes(1));
    vi.mocked(agentive.listPendingStagedChanges).mockResolvedValue([stagedChange('missed')] as never);
    act(() => window.dispatchEvent(new Event('integral:agent-events-reconnected')));
    await waitFor(() => expect(result.current.actionableCount).toBe(1));
  });
  it('refetches when a staged change is resolved on another surface', async () => {
    vi.mocked(agentive.listPendingStagedChanges).mockResolvedValue([
      stagedChange('tok-1'),
    ] as never);

    const { result } = renderHook(() => useAgentInbox(), { wrapper });
    await waitFor(() => expect(result.current.actionableCount).toBe(1));

    vi.mocked(agentive.listPendingStagedChanges).mockResolvedValue([] as never);
    await act(async () => {
      window.dispatchEvent(new Event('integral:staging-state-changed'));
    });

    await waitFor(() => expect(result.current.actionableCount).toBe(0));
  });

  it('lights up as soon as a change is staged', async () => {
    // Found live: the agent staged a change, the card sat awaiting approval in
    // chat, and the Inbox badge stayed dark. The backend emits `staging_created`
    // on mint but the WS bridge only forwarded the resolution events, so the
    // one moment the badge exists for was the one moment it missed.
    const { result } = renderHook(() => useAgentInbox(), { wrapper });
    await waitFor(() => expect(result.current.actionableCount).toBe(0));

    vi.mocked(agentive.listPendingStagedChanges).mockResolvedValue([
      stagedChange('tok-new'),
    ] as never);
    await act(async () => {
      window.dispatchEvent(new Event('integral:staging-created'));
    });

    await waitFor(() => expect(result.current.actionableCount).toBe(1));
  });

  it('does not fetch at all while disabled', async () => {
    // The closed-dock toggle mounts on every page; a badge is not worth three
    // requests per navigation when the caller says it does not need them.
    renderHook(() => useAgentInbox({ enabled: false }), { wrapper });
    await new Promise((r) => setTimeout(r, 0));

    expect(agentive.listPendingStagedChanges).not.toHaveBeenCalled();
    expect(approvals.listApprovals).not.toHaveBeenCalled();
    expect(routines.listRoutines).not.toHaveBeenCalled();
  });
});


describe('useAgentInbox — interrupted refresh recovery', () => {
  it('marks a cached empty queue as loading until its background refresh settles', async () => {
    const { result } = renderHook(() => useAgentInbox(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));
    let release!: (value: never) => void;
    vi.mocked(agentive.listPendingStagedChanges).mockImplementationOnce(
      () => new Promise((resolve) => { release = resolve; }),
    );
    act(() => result.current.refetch());
    await waitFor(() => expect(result.current.loading).toBe(true));
    expect(result.current.actionableCount).toBe(0);
    await act(async () => release([] as never));
    await waitFor(() => expect(result.current.loading).toBe(false));
  });

  it('recovers a failed observed queue without navigation or a new event', async () => {
    vi.mocked(agentive.listPendingStagedChanges).mockRejectedValueOnce(new Error('offline'));
    const { result } = renderHook(() => useAgentInbox(), { wrapper });
    await waitFor(() => expect(result.current.degraded).toBe(true));
    vi.mocked(agentive.listPendingStagedChanges).mockResolvedValue([stagedChange('recovered')] as never);
    await waitFor(() => expect(result.current.degraded).toBe(false), { timeout: 12_000 });
    expect(result.current.actionableCount).toBe(1);
  }, 15_000);
});
