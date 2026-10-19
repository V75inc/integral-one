/**
 * Review before approval, for changes the card cannot show you.
 *
 * The inline card is sized for the dock's narrow column. That is fine for
 * "Create entry X in Marketing" and useless for a batch provisioning an App
 * with four tracks and a taxonomy — and approving what you cannot read is the
 * whole failure mode. These tests pin which changes get the escape hatch, and
 * that opening it does not fork the approval state.
 */

import React from 'react';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import '@testing-library/jest-dom/vitest';

vi.mock('../../../../api/agentive', () => ({
  blessStagingToken: vi.fn(),
  revokeStagingToken: vi.fn(),
  rollbackStagingToken: vi.fn(),
  getStagingTokenState: vi.fn(async () => ({ state: 'pending' })),
  getStagingRollbackStatus: vi.fn(async () => ({ ok: true, available: false })),
}));
vi.mock('../../../../services/graphMutationInvalidation', () => ({
  invalidateAfterAgentWrite: vi.fn(async () => undefined),
}));
vi.mock('@assistant-ui/react', () => ({
  useThreadRuntime: () => ({ append: vi.fn() }),
}));

import { ConfirmProvider } from '../../../../context/ConfirmContext';
import { StagedChangeCard } from '../StagedChangeCard';
import {
  StagedChangeReviewModal,
  isLargeStagedDiff,
} from '../StagedChangeReviewModal';
import type { StagedChange } from '../types';
import type { UseStagedChangeResult } from '../useStagedChange';

function makeStaged(over: Partial<StagedChange> = {}): StagedChange {
  return {
    _kind: 'staged_change',
    token: 'tok-review',
    kind: 'batch',
    state: 'pending',
    summary: 'Provision the Client Work app',
    diff_human: 'Create track **Clients**',
    diff_machine: { op: 'create_track', title: 'Clients' },
    created_at: new Date(0).toISOString(),
    expires_at: new Date(Date.now() + 600_000).toISOString(),
    autonomy_grant_used: false,
    ...over,
  } as StagedChange;
}

const BIG_HUMAN = 'Create track **Clients** with fields and a taxonomy. '.repeat(12);

function wrap(ui: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <ConfirmProvider>{ui}</ConfirmProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => cleanup());
afterEach(() => vi.clearAllMocks());

describe('isLargeStagedDiff', () => {
  it('treats a short single-op change as readable inline', () => {
    expect(isLargeStagedDiff(makeStaged())).toBe(false);
  });

  it('flags a long human diff', () => {
    expect(isLargeStagedDiff(makeStaged({ diff_human: BIG_HUMAN }))).toBe(true);
  });

  it('flags a multi-step batch even when its prose is short', () => {
    // The case that motivated this: a batch reads as one tidy sentence and
    // performs six writes.
    const staged = makeStaged({
      diff_human: 'Set up the app.',
      diff_machine: { op: 'batch', steps: [1, 2, 3, 4] },
    } as Partial<StagedChange>);
    expect(isLargeStagedDiff(staged)).toBe(true);
  });
});

describe('StagedChangeCard — review affordance', () => {
  it('offers review and truncates when the diff is too big for the column', async () => {
    wrap(<StagedChangeCard staged={makeStaged({ diff_human: BIG_HUMAN })} />);

    expect(
      await screen.findByRole('button', { name: /review full change/i }),
    ).toBeInTheDocument();
    // The raw-JSON disclosure is redundant once the modal shows a real viewer.
    expect(screen.queryByText(/show raw diff/i)).toBeNull();
  });

  it('leaves a small change exactly as it was', async () => {
    wrap(<StagedChangeCard staged={makeStaged()} />);

    await waitFor(() =>
      expect(screen.getByText(/show raw diff/i)).toBeInTheDocument(),
    );
    expect(screen.queryByRole('button', { name: /review full change/i })).toBeNull();
  });

  it('opens the modal from the card', async () => {
    const user = userEvent.setup();
    wrap(<StagedChangeCard staged={makeStaged({ diff_human: BIG_HUMAN })} />);

    await user.click(
      await screen.findByRole('button', { name: /review full change/i }),
    );
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
  });
});

describe('StagedChangeReviewModal — shares the caller state', () => {
  function controlsStub(over: Partial<UseStagedChangeResult> = {}) {
    return {
      status: { kind: 'idle', state: 'pending' },
      error: null,
      consumedNav: null,
      isTerminal: false,
      isBlessed: false,
      bless: vi.fn(async () => undefined),
      revoke: vi.fn(async () => undefined),
      rollback: { available: false, loading: false, execute: vi.fn() },
      ...over,
    } as unknown as UseStagedChangeResult;
  }

  it('approves through the caller hook rather than a second instance', async () => {
    // A second `useStagedChange` for the same token would hold its own status
    // and error, and neither instance would learn what the other saw — the
    // exact split that let the card claim a refused write was still running.
    const user = userEvent.setup();
    const controls = controlsStub();
    wrap(
      <StagedChangeReviewModal
        staged={makeStaged()}
        open
        onClose={() => {}}
        controls={controls}
      />,
    );

    await user.click(await screen.findByRole('button', { name: /^approve$/i }));
    expect(controls.bless).toHaveBeenCalledOnce();
  });

  it('shows bound operation fields instead of narrated replacements and keeps live approval controls', async () => {
    const user = userEvent.setup();
    const controls = controlsStub();
    const staged = makeStaged({
      kind: 'invoke_app_operation',
      diff_human: 'Narration\n```json\n{"body":"Invented replacement"}\n```',
      diff_machine: { op: 'invoke_app_operation', input: { body: 'Exact bound passage' },
        review: { description: 'Save the selected material.', input_labels: { properties: { body: { title: 'Selected passage' } } } } },
    });
    wrap(<StagedChangeReviewModal staged={staged} open onClose={() => {}} controls={controls} />);
    expect(await screen.findByText('Selected passage')).toBeInTheDocument();
    expect(screen.getByText('Exact bound passage')).toBeInTheDocument();
    expect(screen.queryByText('Invented replacement')).not.toBeInTheDocument();
    expect(screen.getByText('Technical details').closest('details')).not.toHaveAttribute('open');
    await user.click(screen.getByRole('button', { name: /^Approve$/ }));
    expect(controls.bless).toHaveBeenCalledOnce();
    expect(staged.diff_machine.input).toEqual({ body: 'Exact bound passage' });
  });

  it('shows exact workspace tool inputs while technical details remain collapsed', async () => {
    const staged = makeStaged({ kind: 'call_workspace_tool',
      diff_human: 'Run workspace tool with destination input.',
      diff_machine: { op: 'call_workspace_tool', tool_key: 'prepare_artifact', input: { destination: 'Exact selected resource' } },
    });
    wrap(<StagedChangeReviewModal staged={staged} open onClose={() => {}} controls={controlsStub()} />);
    expect(await screen.findByText('Exact selected resource')).toBeVisible();
    expect(screen.getByText('Technical details').closest('details')).not.toHaveAttribute('open');
  });

  it('cancels a refused approved action through the shared controls without offering retry', async () => {
    const user = userEvent.setup();
    const controls = controlsStub({ status: { kind: 'error', state: 'blessed', message: 'Source changed.' }, isBlessed: true, error: 'Source changed.' });
    wrap(<StagedChangeReviewModal staged={makeStaged({ state: 'blessed' })} open onClose={() => {}} controls={controls} />);
    expect(await screen.findByText('Approved — action incomplete.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Cancel approval' }));
    expect(controls.revoke).toHaveBeenCalledOnce();
    expect(controls.bless).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: /Retry|Approve$/ })).not.toBeInTheDocument();
  });

  it('disables cancellation during a decision and removes it for settled actions', async () => {
    const controls = controlsStub({ status: { kind: 'loading', state: 'blessed' }, isBlessed: true });
    const view = wrap(<StagedChangeReviewModal staged={makeStaged({ state: 'blessed' })} open onClose={() => {}} controls={controls} />);
    expect(await screen.findByRole('button', { name: 'Cancel approval' })).toBeDisabled();
    view.rerender(<StagedChangeReviewModal staged={makeStaged({ state: 'consumed' })} open onClose={() => {}} controls={controlsStub({ status: { kind: 'idle', state: 'consumed' }, isTerminal: true })} />);
    expect(screen.queryByRole('button', { name: 'Cancel approval' })).not.toBeInTheDocument();
  });

  it('surfaces the shared error', async () => {
    wrap(
      <StagedChangeReviewModal
        staged={makeStaged()}
        open
        onClose={() => {}}
        controls={controlsStub({ error: 'Cannot add a track to this app' })}
      />,
    );

    expect(
      await screen.findByText(/cannot add a track to this app/i),
    ).toBeInTheDocument();
  });

  it('keeps a refused decision open and technical details collapsed', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    wrap(<StagedChangeReviewModal
      staged={makeStaged()}
      open
      onClose={onClose}
      controls={controlsStub({ error: 'Permission changed; reload before approving.' })}
    />);
    await user.click(await screen.findByRole('button', { name: /^approve$/i }));
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByText('Permission changed; reload before approving.')).toBeInTheDocument();
    expect(screen.getByText('Technical details').closest('details')).not.toHaveAttribute('open');
  });

  it('says approved-but-not-applied rather than claiming execution', async () => {
    wrap(
      <StagedChangeReviewModal
        staged={makeStaged({ state: 'blessed' })}
        open
        onClose={() => {}}
        controls={controlsStub({
          status: { kind: 'idle', state: 'blessed' },
          isBlessed: true,
        } as Partial<UseStagedChangeResult>)}
      />,
    );

    expect(await screen.findByText(/not yet applied/i)).toBeInTheDocument();
    expect(screen.queryByText(/awaiting agent execution/i)).toBeNull();
  });
});
