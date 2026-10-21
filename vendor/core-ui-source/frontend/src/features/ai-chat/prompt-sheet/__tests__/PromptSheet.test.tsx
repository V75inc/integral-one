import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { PromptSheetHost } from '../PromptSheet';
import { usePromptQueue } from '../usePromptQueue';

vi.mock('../usePromptQueue', () => ({
  usePromptQueue: vi.fn(),
}));

const approveWrite = vi.fn(async () => undefined);

function renderPendingWrite(failed = false) {
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
    },
    page: {
      total: 1,
      index: 0,
      canPrev: false,
      canNext: false,
      prev: vi.fn(),
      next: vi.fn(),
    },
    busy: false,
    error: null,
    approveWrite,
    rejectWrite: vi.fn(async () => undefined),
    cancelAll: vi.fn(async () => undefined),
  } as never);

  render(
    <PromptSheetHost>
      {({ sheet }) => <>{sheet}</>}
    </PromptSheetHost>,
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
