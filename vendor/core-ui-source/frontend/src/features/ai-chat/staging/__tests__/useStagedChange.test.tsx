/**
 * The approval state machine, now shared by the chat card and the Approvals
 * page row.
 *
 * The bug that motivated the extraction: the Approvals row implemented
 * approval as a bare `blessStagingToken` call, so a write that *did* happen
 * stayed invisible because nothing invalidated the caches.
 *
 * Blessing only marks the token approved. When the backend returns no
 * `execute_result` the write has NOT happened and the agent applies it on its
 * next turn — the card stays `blessed` and nudges. The client must never run
 * the write itself: the old REST fallback then *revoked* the token, so the
 * server's truth read "rejected" for an applied change, Undo broke, and the
 * write lost its provenance. The first tests here pin both halves.
 */

import React from 'react';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

vi.mock('../../../../api/agentive', () => ({
  blessStagingToken: vi.fn(),
  revokeStagingToken: vi.fn(),
  rollbackStagingToken: vi.fn(),
  getStagingTokenState: vi.fn(async () => null),
  getStagingRollbackStatus: vi.fn(async () => ({ ok: true, available: false })),
}));

vi.mock('../../../../services/graphMutationInvalidation', () => ({
  invalidateAfterAgentWrite: vi.fn(async () => undefined),
}));

import * as api from '../../../../api/agentive';
import * as invalidation from '../../../../services/graphMutationInvalidation';
import { useStagedChange } from '../useStagedChange';
import type { StagedChange } from '../types';

const staged: StagedChange = {
  _kind: 'staged_change',
  token: 'tok-1',
  kind: 'create_entry',
  state: 'pending',
  summary: 'File a note in Inbox',
  diff_human: '',
  diff_machine: {},
  created_at: new Date(0).toISOString(),
  expires_at: new Date(0).toISOString(),
  autonomy_grant_used: false,
} as StagedChange;

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  vi.mocked(api.getStagingTokenState).mockResolvedValue(null as never);
  vi.mocked(api.getStagingRollbackStatus).mockResolvedValue({
    ok: true,
    available: false,
  } as never);
});

afterEach(() => vi.clearAllMocks());

describe('useStagedChange — bless', () => {
  it('leaves the card blessed — never writes or revokes — when the backend returned no execute_result', async () => {
    // No write ran server-side. The agent applies it on its next turn; the
    // client must not perform the write over REST and must not touch the
    // token's state (the old fallback revoked it, corrupting server truth).
    vi.mocked(api.blessStagingToken).mockResolvedValue({ ok: true } as never);

    const { result } = renderHook(() => useStagedChange(staged), { wrapper });
    await act(async () => {
      await result.current.bless();
    });

    expect(api.revokeStagingToken).not.toHaveBeenCalled();
    expect(invalidation.invalidateAfterAgentWrite).not.toHaveBeenCalled();
    await waitFor(() => expect(result.current.state).toBe('blessed'));
    expect(result.current.error).toBeNull();
    expect(result.current.isTerminal).toBe(false);
  });

  it('treats execute_result.skipped as a failure, not an applied change', async () => {
    vi.mocked(api.blessStagingToken).mockResolvedValue({
      ok: true,
      execute_result: { skipped: true },
    } as never);
    const onNeedsAgentNudge = vi.fn();

    const { result } = renderHook(
      () => useStagedChange(staged, { onNeedsAgentNudge }),
      { wrapper },
    );
    await act(async () => {
      await result.current.bless();
    });

    await waitFor(() => expect(result.current.state).toBe('blessed'));
    expect(result.current.error).toBe('The server skipped this write.');
    expect(invalidation.invalidateAfterAgentWrite).not.toHaveBeenCalled();
    expect(onNeedsAgentNudge).not.toHaveBeenCalled();
  });

  it('invalidates caches after a write lands', async () => {
    // Otherwise the change is real but invisible until a manual refresh.
    vi.mocked(api.blessStagingToken).mockResolvedValue({
      ok: true,
      execute_result: { entry_id: 'n.Entry.1' },
    } as never);

    const { result } = renderHook(() => useStagedChange(staged), { wrapper });
    await act(async () => {
      await result.current.bless();
    });

    expect(invalidation.invalidateAfterAgentWrite).toHaveBeenCalled();
    await waitFor(() => expect(result.current.state).toBe('consumed'));
  });

  it('nudges staging_follow_through when no write ran', async () => {
    // The host must apply the blessed token — empty follow-through is the
    // signal, not a free-form user utterance.
    vi.mocked(api.blessStagingToken).mockResolvedValue({ ok: true } as never);
    const onNeedsAgentNudge = vi.fn();

    const { result } = renderHook(
      () => useStagedChange(staged, { onNeedsAgentNudge }),
      { wrapper },
    );
    await act(async () => {
      await result.current.bless();
    });

    expect(onNeedsAgentNudge).toHaveBeenCalledTimes(1);
    expect(onNeedsAgentNudge).toHaveBeenCalledWith('staging_follow_through');
    await waitFor(() => expect(result.current.state).toBe('blessed'));
  });

  it('does not nudge when the write already completed', async () => {
    vi.mocked(api.blessStagingToken).mockResolvedValue({
      ok: true,
      execute_result: { entry_id: 'n.Entry.1' },
    } as never);
    const onNeedsAgentNudge = vi.fn();

    const { result } = renderHook(
      () => useStagedChange(staged, { onNeedsAgentNudge }),
      { wrapper },
    );
    await act(async () => {
      await result.current.bless();
    });

    expect(onNeedsAgentNudge).not.toHaveBeenCalled();
  });

  it('nudges staging_follow_through when design affirm needs an agent build', async () => {
    vi.mocked(api.blessStagingToken).mockResolvedValue({
      ok: true,
      execute_result: { needs_agent_build: true, approved: true },
    } as never);
    const onNeedsAgentNudge = vi.fn();
    const events: string[] = [];
    const onEvent = () => events.push('staging-state-changed');
    window.addEventListener('integral:staging-state-changed', onEvent);

    const { result } = renderHook(
      () => useStagedChange(staged, { onNeedsAgentNudge }),
      { wrapper },
    );
    await act(async () => {
      await result.current.bless();
    });

    window.removeEventListener('integral:staging-state-changed', onEvent);
    expect(onNeedsAgentNudge).toHaveBeenCalledWith('staging_follow_through');
    expect(events).toEqual(['staging-state-changed']);
    await waitFor(() => expect(result.current.state).toBe('consumed'));
  });

  it('surfaces a server-side write failure instead of claiming success', async () => {
    vi.mocked(api.blessStagingToken).mockResolvedValue({
      ok: true,
      execute_result: { error: true, message: 'Track is read-only' },
    } as never);
    const onNeedsAgentNudge = vi.fn();

    const { result } = renderHook(
      () => useStagedChange(staged, { onNeedsAgentNudge }),
      { wrapper },
    );
    await act(async () => {
      await result.current.bless();
    });

    await waitFor(() => expect(result.current.error).toBe('Track is read-only'));
    expect(result.current.state).toBe('blessed');
    expect(onNeedsAgentNudge).not.toHaveBeenCalled();
  });

  it('shows detail when the write failed without a message', async () => {
    vi.mocked(api.blessStagingToken).mockResolvedValue({
      ok: true,
      execute_result: {
        error: true,
        detail: 'add_entry_type requires spec with name/key',
      },
    } as never);

    const { result } = renderHook(() => useStagedChange(staged), { wrapper });
    await act(async () => {
      await result.current.bless();
    });

    await waitFor(() =>
      expect(result.current.error).toBe('add_entry_type requires spec with name/key'),
    );
  });
});

describe('useStagedChange — reconcile on mount', () => {
  it('adopts the backend state over the mint-time snapshot', async () => {
    // The snapshot is always `pending`; without this a change approved
    // earlier reads as awaiting approval after any remount.
    vi.mocked(api.getStagingTokenState).mockResolvedValue({
      state: 'consumed',
    } as never);

    const { result } = renderHook(() => useStagedChange(staged), { wrapper });
    await waitFor(() => expect(result.current.state).toBe('consumed'));
  });

  it('falls to expired — not consumed — for a token the backend has lost', async () => {
    // Swept after TTL, or the in-memory store died with a restart. At that
    // point "approved" and "never approved" are indistinguishable, so
    // claiming either would be a lie; expired is the honest terminal.
    vi.mocked(api.getStagingTokenState).mockResolvedValue(null as never);

    const { result } = renderHook(() => useStagedChange(staged), { wrapper });
    await waitFor(() => expect(result.current.state).toBe('expired'));
  });

  it('keeps positive evidence that the change was applied', async () => {
    vi.mocked(api.getStagingTokenState).mockResolvedValue(null as never);

    const { result } = renderHook(
      () => useStagedChange({ ...staged, state: 'consumed' } as StagedChange),
      { wrapper },
    );
    // A snapshot already carrying `consumed` must not be downgraded.
    await waitFor(() => expect(result.current.state).toBe('consumed'));
  });
});

describe('useStagedChange — revoke and terminal', () => {
  it('reports a terminal state to the caller once', async () => {
    vi.mocked(api.revokeStagingToken).mockResolvedValue({ ok: true } as never);
    vi.mocked(api.getStagingTokenState).mockResolvedValue({
      state: 'pending',
    } as never);
    const onTerminal = vi.fn();

    const { result } = renderHook(
      () => useStagedChange(staged, { onTerminal }),
      { wrapper },
    );
    await act(async () => {
      await result.current.revoke();
    });

    await waitFor(() => expect(result.current.state).toBe('revoked'));
    expect(onTerminal).toHaveBeenCalledWith('tok-1');
    expect(result.current.isTerminal).toBe(true);
  });

  it('surfaces a failed revoke rather than showing it as rejected', async () => {
    vi.mocked(api.revokeStagingToken).mockResolvedValue({
      ok: false,
      message: 'Token already consumed',
    } as never);
    vi.mocked(api.getStagingTokenState).mockResolvedValue({
      state: 'pending',
    } as never);

    const { result } = renderHook(() => useStagedChange(staged), { wrapper });
    await act(async () => {
      await result.current.revoke();
    });

    await waitFor(() =>
      expect(result.current.error).toBe('Token already consumed'),
    );
    expect(result.current.state).not.toBe('revoked');
  });
});

describe('useStagedChange — reconcile cost', () => {
  it('does not ask about a change that is already settled', async () => {
    // Transcripts are mostly settled cards, and a terminal snapshot cannot
    // change — so asking is pure cost. Measured before this: 4 `token`
    // requests per card per load, on cards whose answer was already known.
    const { result } = renderHook(
      () => useStagedChange({ ...staged, state: 'consumed' } as StagedChange),
      { wrapper },
    );

    await waitFor(() => expect(result.current.state).toBe('consumed'));
    expect(api.getStagingTokenState).not.toHaveBeenCalled();
  });

  it('still asks about one that could have moved on without us', async () => {
    // `pending` is the case the reconcile exists for: the snapshot is taken at
    // mint time, so it says `pending` even for a change approved long ago.
    vi.mocked(api.getStagingTokenState).mockResolvedValue({
      state: 'consumed',
    } as never);

    const { result } = renderHook(() => useStagedChange(staged), { wrapper });

    await waitFor(() => expect(result.current.state).toBe('consumed'));
    expect(api.getStagingTokenState).toHaveBeenCalledWith('tok-1');
  });

  it('still asks about a blessed change, which is not finished', async () => {
    // `blessed` means approved but not applied — it becomes `consumed` when
    // the write lands, so it must keep reconciling.
    vi.mocked(api.getStagingTokenState).mockResolvedValue({
      state: 'consumed',
    } as never);

    renderHook(
      () => useStagedChange({ ...staged, state: 'blessed' } as StagedChange),
      { wrapper },
    );

    await waitFor(() =>
      expect(api.getStagingTokenState).toHaveBeenCalledWith('tok-1'),
    );
  });
});

describe('useStagedChange — a refusal this surface did not witness', () => {
  it('explains a recorded failure found on reconcile', async () => {
    // The card that did not click. Before the backend recorded the reason,
    // this instance saw only `blessed` and could say nothing beyond
    // "approved, not yet applied".
    vi.mocked(api.getStagingTokenState).mockResolvedValue({
      state: 'blessed',
      last_error: { message: 'Cannot add a track to this app' },
    } as never);

    const { result } = renderHook(() => useStagedChange(staged), { wrapper });

    await waitFor(() =>
      expect(result.current.error).toBe('Cannot add a track to this app'),
    );
    expect(result.current.state).toBe('blessed');
  });

  it('explains one that arrives on the push', async () => {
    // Approving in the inbox flips the chat card via this event; the reason
    // has to ride along or the card is back to an unexplained "approved".
    vi.mocked(api.getStagingTokenState).mockResolvedValue({
      state: 'pending',
    } as never);
    const { result } = renderHook(() => useStagedChange(staged), { wrapper });
    await waitFor(() => expect(result.current.state).toBe('pending'));

    await act(async () => {
      window.dispatchEvent(
        new CustomEvent('integral:staging-state-changed', {
          detail: {
            token: 'tok-1',
            state: 'blessed',
            last_error: { message: 'Track is read-only' },
          },
        }),
      );
    });

    await waitFor(() => expect(result.current.error).toBe('Track is read-only'));
  });

  it('stays quiet when there is nothing to explain', async () => {
    vi.mocked(api.getStagingTokenState).mockResolvedValue({
      state: 'consumed',
    } as never);

    const { result } = renderHook(() => useStagedChange(staged), { wrapper });

    await waitFor(() => expect(result.current.state).toBe('consumed'));
    expect(result.current.error).toBeNull();
  });
});
