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

vi.mock('../../../context/ConfirmContext', () => ({
  useConfirm: () => async () => true,
}));

import { ActionBarWidget } from '../ActionBarWidget';

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
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
