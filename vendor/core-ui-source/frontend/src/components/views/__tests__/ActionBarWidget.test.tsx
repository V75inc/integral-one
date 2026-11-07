import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import type { SavedView } from '../../../types';

const mockToolsCall = vi.fn();
const mockShowToast = vi.fn();

vi.mock('../../../api/tools', () => ({
  toolsApi: { call: (key: string, input: Record<string, unknown>) => mockToolsCall(key, input) },
}));

vi.mock('../../../context/ToastContext', () => ({
  useToast: () => ({ showToast: mockShowToast }),
}));

let mockRole: string | undefined;
vi.mock('../../../context/ScopeContext', () => ({
  useScopeOptional: () => ({ activeWorkspace: { your_role: mockRole } }),
}));

vi.mock('../../../context/ConfirmContext', () => ({
  useConfirm: () => async () => true,
}));

import { ActionBarWidget } from '../ActionBarWidget';

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  mockRole = undefined;
});

function view(buttons: Record<string, unknown>[], extraBindings: Record<string, unknown> = {}): SavedView {
  return {
    id: 'v-1',
    name: 'Actions',
    type: 'action_bar',
    track_id: 'track-1',
    config: { __bindings: { entryId: 'pay-run-1', buttons, ...extraBindings } },
  } as SavedView;
}

const noop = () => {};

describe('ActionBarWidget — refresh-nonce notification', () => {
  it('calls onActionComplete after a successful tool run', async () => {
    mockToolsCall.mockResolvedValue({ output: { ok: true } });
    const onActionComplete = vi.fn();

    render(
      <ActionBarWidget
        view={view(
          [{ key: 'go', label: 'Go', tool: 'some_tool' }],
          { onActionComplete }
        )}
        entries={[]}
        isLoading={false}
        onEntryOpen={noop}
      />
    );

    fireEvent.click(screen.getByText('Go'));

    await waitFor(() => {
      expect(onActionComplete).toHaveBeenCalledTimes(1);
    });
  });

  it('does NOT call onActionComplete when the tool reports ok:false', async () => {
    mockToolsCall.mockResolvedValue({ output: { ok: false, reason: 'nothing to do' } });
    const onActionComplete = vi.fn();

    render(
      <ActionBarWidget
        view={view(
          [{ key: 'go', label: 'Go', tool: 'some_tool' }],
          { onActionComplete }
        )}
        entries={[]}
        isLoading={false}
        onEntryOpen={noop}
      />
    );

    fireEvent.click(screen.getByText('Go'));

    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith(
        expect.stringContaining('nothing to do'),
        'error'
      );
    });
    expect(onActionComplete).not.toHaveBeenCalled();
  });

  it('does NOT call onActionComplete when the tool call throws', async () => {
    mockToolsCall.mockRejectedValue(new Error('network down'));
    const onActionComplete = vi.fn();

    render(
      <ActionBarWidget
        view={view(
          [{ key: 'go', label: 'Go', tool: 'some_tool' }],
          { onActionComplete }
        )}
        entries={[]}
        isLoading={false}
        onEntryOpen={noop}
      />
    );

    fireEvent.click(screen.getByText('Go'));

    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith('network down', 'error');
    });
    expect(onActionComplete).not.toHaveBeenCalled();
  });

  it('tolerates a missing onActionComplete binding (back-compat)', async () => {
    mockToolsCall.mockResolvedValue({ output: { ok: true } });

    render(
      <ActionBarWidget
        view={view([{ key: 'go', label: 'Go', tool: 'some_tool' }])}
        entries={[]}
        isLoading={false}
        onEntryOpen={noop}
      />
    );

    fireEvent.click(screen.getByText('Go'));

    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith('Go complete', 'success');
    });
  });
  it('shows a domain result summary and refreshes partially successful batches', async () => {
    mockToolsCall.mockResolvedValueOnce({ output: { ok: true, summary: '20 records: 19 created, 1 unchanged' } });
    const onActionComplete = vi.fn();
    render(<ActionBarWidget view={view([{ key: 'go', label: 'Go', tool: 'some_tool' }], { onActionComplete })} entries={[]} isLoading={false} onEntryOpen={noop} />);
    fireEvent.click(screen.getByText('Go'));
    await waitFor(() => expect(mockShowToast).toHaveBeenCalledWith('20 records: 19 created, 1 unchanged', 'success'));
    mockToolsCall.mockResolvedValueOnce({ output: { ok: false, reason: '1 record failed', object_refs: [{ kind: 'entry', id: 'own-record' }] } });
    fireEvent.click(screen.getByText('Go'));
    await waitFor(() => expect(onActionComplete).toHaveBeenCalledTimes(2));
    expect(mockShowToast).toHaveBeenLastCalledWith('Go: 1 record failed', 'error');
  });

});

describe('ActionBarWidget — next-step buttons', () => {
  const buttons = [
    { key: 'export', label: 'Export register', tool: 'export_tool' },
    { key: 'review', label: 'Mark as reviewed', tool: 'review_tool', placement: 'end', requires_admin: true,
      visible_if: { field: 'status', in: ['waiting_for_review'] } },
    { key: 'approve', label: 'Approve and finalize', tool: 'approve_tool', placement: 'end', requires_admin: true,
      visible_if: { field: 'status', in: ['waiting_for_approval'] } },
  ];
  const renderBar = (status: string) =>
    render(
      <ActionBarWidget
        view={view(buttons, { entryValues: { status } })}
        entries={[]}
        isLoading={false}
        onEntryOpen={noop}
      />
    );

  it('shows only the next step for the current status', () => {
    renderBar('waiting_for_review');
    expect(screen.getByText('Mark as reviewed')).toBeInTheDocument();
    expect(screen.queryByText('Approve and finalize')).toBeNull();
    expect(screen.getByText('Export register')).toBeInTheDocument();
  });

  it('shows nothing to move forward once the run is past those steps', () => {
    renderBar('paid');
    expect(screen.queryByText('Mark as reviewed')).toBeNull();
    expect(screen.queryByText('Approve and finalize')).toBeNull();
  });

  it('puts forward-moving buttons in the right-hand group', () => {
    renderBar('waiting_for_review');
    const bar = screen.getByTestId('action-bar-widget');
    const [left, right] = Array.from(bar.children);
    expect(left).toHaveTextContent('Export register');
    expect(right).toHaveTextContent('Mark as reviewed');
    expect(right.className).toContain('ml-auto');
  });

  it('disables an admin-only button for a non-admin and explains why', async () => {
    mockRole = 'member';
    renderBar('waiting_for_review');
    const button = screen.getByText('Mark as reviewed').closest('button')!;
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('title', 'Only workspace admins can do this.');
    fireEvent.click(button);
    expect(mockToolsCall).not.toHaveBeenCalled();
  });

  it('lets an admin run it', async () => {
    mockRole = 'admin';
    mockToolsCall.mockResolvedValue({ output: { ok: true } });
    renderBar('waiting_for_review');
    fireEvent.click(screen.getByText('Mark as reviewed'));
    await waitFor(() => expect(mockToolsCall).toHaveBeenCalledWith('review_tool', expect.anything()));
  });
});

describe('ActionBarWidget — keeping the record current', () => {
  it('reloads the host record after a successful action so the buttons follow the new status', async () => {
    mockToolsCall.mockResolvedValue({ output: { ok: true } });
    const onHostChanged = vi.fn();
    render(
      <ActionBarWidget
        view={view([{ key: 'go', label: 'Go', tool: 'some_tool' }], { onHostChanged })}
        entries={[]}
        isLoading={false}
        onEntryOpen={noop}
      />
    );
    fireEvent.click(screen.getByText('Go'));
    await waitFor(() => expect(onHostChanged).toHaveBeenCalledTimes(1));
  });

  it('keeps reloading while the record is mid-change, and stops when it settles', async () => {
    vi.useFakeTimers();
    try {
      const onHostChanged = vi.fn();
      const bar = (status: string) => (
        <ActionBarWidget
          view={view([{ key: 'go', label: 'Go', tool: 'some_tool' }], {
            onHostChanged,
            entryValues: { status },
            refresh_while: { field: 'status', in: ['finalizing'] },
          })}
          entries={[]}
          isLoading={false}
          onEntryOpen={noop}
        />
      );
      const { rerender } = render(bar('finalizing'));
      await vi.advanceTimersByTimeAsync(8100);
      expect(onHostChanged).toHaveBeenCalledTimes(2);
      rerender(bar('approved'));
      await vi.advanceTimersByTimeAsync(8100);
      expect(onHostChanged).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });
  it('never overlaps slow refreshes, survives rejection, and stops after unmount', async () => {
    vi.useFakeTimers();
    try {
      let reject!: (reason: Error) => void;
      const onHostChanged = vi.fn().mockImplementationOnce(() => new Promise<void>((_, fail) => { reject = fail; })).mockResolvedValue(undefined);
      const props = { entries: [], isLoading: false, onEntryOpen: noop };
      const configured = (callback: () => Promise<void>) => view([{ key: 'go', label: 'Go', tool: 'some_tool' }], {
        onHostChanged: callback, entryValues: { status: 'finalizing' },
        refresh_while: { field: 'status', in: ['finalizing'] },
      });
      const { rerender, unmount } = render(<ActionBarWidget {...props} view={configured(onHostChanged)} />);
      await vi.advanceTimersByTimeAsync(4000);
      rerender(<ActionBarWidget {...props} view={configured(() => onHostChanged())} />);
      await vi.advanceTimersByTimeAsync(20000);
      expect(onHostChanged).toHaveBeenCalledTimes(1);
      reject(new Error('Temporary network failure'));
      await vi.advanceTimersByTimeAsync(4000);
      expect(onHostChanged).toHaveBeenCalledTimes(2);
      unmount();
      await vi.advanceTimersByTimeAsync(20000);
      expect(onHostChanged).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

});

describe('ActionBarWidget — greyed-out steps', () => {
  const steps = [
    { key: 'review', label: 'Mark as reviewed', tool: 'review_tool', placement: 'end',
      disabled_if: { field: 'status', not_in: ['waiting_for_review'] },
      disabled_reason: 'Available once the pay run is waiting for review.' },
    { key: 'paid', label: 'Mark as paid', tool: 'paid_tool', placement: 'end',
      disabled_if: { field: 'status', not_in: ['approved'] },
      disabled_reason: 'Available once the pay run is approved.' },
  ];
  const renderSteps = (status: string) =>
    render(
      <ActionBarWidget
        view={view(steps, { entryValues: { status } })}
        entries={[]}
        isLoading={false}
        onEntryOpen={noop}
      />
    );

  it('shows every step, but only the applicable one is clickable', () => {
    renderSteps('waiting_for_review');
    expect(screen.getByText('Mark as reviewed').closest('button')).toBeEnabled();
    const paid = screen.getByText('Mark as paid').closest('button')!;
    expect(paid).toBeDisabled();
    expect(paid).toHaveAttribute('title', 'Available once the pay run is approved.');
  });

  it('does not run a greyed-out step when clicked', () => {
    renderSteps('waiting_for_review');
    fireEvent.click(screen.getByText('Mark as paid'));
    expect(mockToolsCall).not.toHaveBeenCalled();
  });

  it('moves the enabled step along with the status', () => {
    renderSteps('approved');
    expect(screen.getByText('Mark as reviewed').closest('button')).toBeDisabled();
    expect(screen.getByText('Mark as paid').closest('button')).toBeEnabled();
  });
});
