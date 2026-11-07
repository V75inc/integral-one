import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { PromptSheetHost } from '../PromptSheet';
import { usePromptQueue } from '../usePromptQueue';
import type { PromptStagedWriteItem } from '../types';
import { ToastProvider } from '../../../../context/ToastContext';

vi.mock('../usePromptQueue', () => ({
  usePromptQueue: vi.fn(),
}));
vi.mock('../../../../components/entries/relations/RelationValue', () => ({
  RelationValue: ({ value }: { value: string }) => <a href={`/entries/${value}`}>Selected record</a>,
}));

const approveWrite = vi.fn(async () => undefined);

function renderPendingWrite(failed = false, extra: Partial<PromptStagedWriteItem> = {}, busy = false) {
  vi.mocked(usePromptQueue).mockReturnValue({
    open: true,
    current: {
      id: 'write-1',
      kind: 'staged_write',
      status: 'pending',
      token: 'token-1',
      write_kind: 'create_entry',
      summary: 'Create entry “Sample Widget”',
      ...(failed ? {staged_state: 'blessed', last_error: {message: 'Validation failed'}, completed_operations: 2} : {}),
      ...extra,
    },
    page: {
      total: 1,
      index: 0,
      canPrev: false,
      canNext: false,
      prev: vi.fn(),
      next: vi.fn(),
    },
    busy,
    error: null,
    approveWrite,
    rejectWrite: vi.fn(async () => undefined),
    cancelAll: vi.fn(async () => undefined),
  } as never);

  render(
    <ToastProvider><PromptSheetHost>
      {({ sheet }) => <>{sheet}</>}
    </PromptSheetHost></ToastProvider>,
  );
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('PromptSheet staged-write approval', () => {
  it('offers one-shot approval without a standing auto-allow control', () => {
    renderPendingWrite();

    expect(screen.getByRole('button', { name: 'Approve' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Reject' })).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Auto-allow kind' })).toBeNull();
  });

  it('routes approval through the one-shot decision callback', () => {
    renderPendingWrite();
    fireEvent.click(screen.getByRole('button', { name: 'Approve' }));

    expect(approveWrite).toHaveBeenCalledOnce();
  });

  it('does not flash a failure message while an approved change is applying', () => {
    renderPendingWrite(false, {staged_state:'blessed'}, true);
    expect(screen.getByText('Applying this change…')).toBeVisible();
    expect(screen.getByRole('button', {name:'Applying…'})).toBeDisabled();
    expect(screen.queryByText('This change needs attention')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', {name:'Retry application'})).not.toBeInTheDocument();
  });

  it('reviews the literal batch inputs in the active chat approval sheet', () => {
    const child = (entry: string, value: number) => ({ kind: 'call_workspace_tool', summary: 'Apply selected change',
      diff_machine: { op: 'call_workspace_tool', input: { entry_id: entry, value } },
    });
    renderPendingWrite(false, { write_kind: 'batch', diff_human: 'Narrated value 999',
      diff_machine: { operations: [child('n.Entry.first', 12), child('n.Entry.second', 27)] },
    });
    expect(screen.getByText('12')).toBeVisible();
    expect(screen.getByText('27')).toBeVisible();
    expect(screen.getAllByRole('link', { name: 'Selected record' })).toHaveLength(2);
    expect(approveWrite).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Approve' }));
    expect(approveWrite).toHaveBeenCalledOnce();
  });

  it('ignores malformed command inputs without blocking the approval controls', () => {
    renderPendingWrite(false, { write_kind: 'batch', diff_machine: [] });
    expect(screen.queryByText('Review change details')).toBeNull();
    expect(screen.getByRole('button', { name: 'Approve' })).toBeEnabled();
  });
});

it('retains execution failure and partial progress in the review card', () => {
  renderPendingWrite(true);
  const summary = screen.getByRole('button', { name: "Your approval was saved, but this change couldn't be finished." });
  expect(summary).toHaveAttribute('aria-expanded', 'false');
  expect(screen.queryByText(/Validation failed/)).not.toBeInTheDocument();
  fireEvent.click(summary);
  expect(summary).toHaveAttribute('aria-expanded', 'true');
  expect(screen.getByRole('alert')).toHaveTextContent('Validation failed');
  expect(screen.getByRole('alert')).toHaveTextContent("2 changes were already saved. Trying again continues with what's left.");
  expect(screen.getByRole('button', { name: 'Retry application' })).toBeVisible();
  expect(screen.queryByRole('button', { name: 'Approve' })).toBeNull();
});
