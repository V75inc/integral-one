import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';

const {
  auiState,
  appendAssistantNote,
  getRollbackStatusShared,
  rollbackStagingToken,
} = vi.hoisted(() => ({
    auiState: {
      thread: { isRunning: false },
      message: { content: [] as unknown[], parts: [] as unknown[] },
    },
    appendAssistantNote: vi.fn(),
    getRollbackStatusShared: vi.fn(),
    rollbackStagingToken: vi.fn(),
  }));

vi.mock('@assistant-ui/react', () => ({
  useAuiState: (selector: (state: typeof auiState) => unknown) =>
    selector(auiState),
}));
vi.mock('../../../../api/agentive', () => ({
  getStagingTokenState: vi.fn(async () => null),
  revokeStagingToken: vi.fn(),
  rollbackStagingToken,
}));
vi.mock('../../staging/rollbackStatusCache', () => ({
  getRollbackStatusShared,
}));
vi.mock('../../AIChatSurface', () => ({
  useChatActivity: () => ({ appendAssistantNote }),
}));
vi.mock('../../../../services/graphMutationInvalidation', () => ({
  invalidateAfterAgentWrite: vi.fn(async () => undefined),
}));

import { ConfirmProvider } from '../../../../context/ConfirmContext';
import { MessageUndoActions } from '../MessageUndoActions';

function makeStaged(over: Record<string, unknown> = {}) {
  return {
    _kind: 'staged_change',
    token: 'tok-undo',
    kind: 'attach_uploaded_file',
    summary: 'Attach the receipt to Cordless Drill',
    diff_human: 'Attach receipt',
    diff_machine: {},
    state: 'consumed',
    created_at: new Date(0).toISOString(),
    expires_at: new Date(Date.now() + 60_000).toISOString(),
    autonomy_grant_used: false,
    ...over,
  };
}

function setMessage(staged: ReturnType<typeof makeStaged>) {
  auiState.message.content = [];
  auiState.message.parts = [
    { type: 'tool-call', result: staged },
  ];
}

function renderActions() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <ConfirmProvider>
        <MessageUndoActions />
      </ConfirmProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  auiState.thread.isRunning = false;
  setMessage(makeStaged());
  getRollbackStatusShared.mockResolvedValue({ ok: true, available: true });
  rollbackStagingToken.mockResolvedValue({ ok: true });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('MessageUndoActions rollback outcome', () => {
  it('shows a visible completion receipt after a successful undo', async () => {
    const user = userEvent.setup();
    renderActions();

    await user.click(await screen.findByRole('button', { name: 'Undo agent changes' }));
    await user.click(await screen.findByRole('button', { name: 'Undo changes' }));

    expect(await screen.findByRole('status')).toHaveTextContent(
      'Undone: Attach the receipt to Cordless Drill.',
    );
    expect(appendAssistantNote).toHaveBeenCalledWith(
      'Undo complete: Attach the receipt to Cordless Drill was reversed. The earlier completion and readback messages describe the state before this undo.',
    );
  });

  it('restores the completion receipt from the persisted transcript after reload', async () => {
    setMessage(makeStaged({ rolled_back_at: '2026-10-05T00:00:00Z' }));
    renderActions();

    expect(await screen.findByRole('status')).toHaveTextContent(
      'Undone: Attach the receipt to Cordless Drill.',
    );
    await waitFor(() => expect(getRollbackStatusShared).not.toHaveBeenCalled());
  });
});
