import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ResourceTransferDialog } from './ResourceTransferDialog';
import { portableApi } from '../../api/portable';

const toast = vi.fn();
vi.mock('../../context/ToastContext', () => ({ useToast: () => ({ showToast: toast }) }));
vi.mock('../../api/portable', () => ({ portableApi: { list: vi.fn(), export: vi.fn(), preview: vi.fn(), import: vi.fn() } }));

const props = { open: true, kind: 'app' as const, workspaceId: 'ws', onClose: vi.fn(), onImported: vi.fn() };
const summary = { kind: 'app' as const, mode: 'full' as const, names: ['Projects'], apps: 1, tracks: 2, entries: 5, attachments: 1 };

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(portableApi.list).mockResolvedValue({ items: [{ id: 'a', name: 'Projects' }, { id: 'b', name: 'People' }], cursor: undefined });
  vi.mocked(portableApi.preview).mockResolvedValue(summary);
  vi.mocked(portableApi.import).mockResolvedValue(summary);
  vi.mocked(portableApi.export).mockResolvedValue(new Blob(['zip']));
  URL.createObjectURL = vi.fn(() => 'blob:export');
  URL.revokeObjectURL = vi.fn();
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
});

describe('portable resource dialog', () => {
  it('exports multiple selections with the chosen data mode', async () => {
    render(<ResourceTransferDialog {...props} />);
    fireEvent.click(await screen.findByText('Projects'));
    fireEvent.click(screen.getByText('People'));
    fireEvent.click(screen.getByText('Configuration and data'));
    fireEvent.click(screen.getByText('Download export'));
    await waitFor(() => expect(portableApi.export).toHaveBeenCalledWith('app', ['a', 'b'], 'full'));
    await waitFor(() => expect(props.onClose).toHaveBeenCalled());
    expect(toast).toHaveBeenCalledWith('Export downloaded.', 'success');
  });

  it('previews then imports copies, never imports before confirmation', async () => {
    render(<ResourceTransferDialog {...props} />);
    fireEvent.click(screen.getByRole('tab', { name: 'Import' }));
    const file = new File(['zip'], 'backup.integral.zip', { type: 'application/zip' });
    fireEvent.change(screen.getByLabelText('Integral archive'), { target: { files: [file] } });
    fireEvent.click(screen.getByText('Preview import'));
    expect(await screen.findByText('1 App · 2 Tracks · 5 records · 1 attachment')).toBeInTheDocument();
    expect(portableApi.import).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText('Import copies'));
    await waitFor(() => expect(portableApi.import).toHaveBeenCalledWith(file, undefined));
    expect(props.onImported).toHaveBeenCalledTimes(1);
  });

  it('keeps App-scoped Track imports contextual', async () => {
    vi.mocked(portableApi.preview).mockResolvedValue({ ...summary, kind: 'track' });
    render(<ResourceTransferDialog {...props} kind="track" appId="parent" />);
    await waitFor(() => expect(portableApi.list).toHaveBeenCalledWith('track', undefined, 'parent'));
    fireEvent.click(screen.getByRole('tab', { name: 'Import' }));
    const file = new File(['zip'], 'tracks.integral.zip');
    fireEvent.change(screen.getByLabelText('Integral archive'), { target: { files: [file] } });
    fireEvent.click(screen.getByText('Preview import'));
    fireEvent.click(await screen.findByText('Import copies'));
    await waitFor(() => expect(portableApi.import).toHaveBeenCalledWith(file, 'parent'));
  });

  it('retains selections across pages', async () => {
    vi.mocked(portableApi.list).mockResolvedValueOnce({ items: [{ id: 'a', name: 'First' }], cursor: 'next' })
      .mockResolvedValueOnce({ items: [{ id: 'b', name: 'Later' }], cursor: undefined });
    render(<ResourceTransferDialog {...props} />);
    fireEvent.click(await screen.findByText('First'));
    fireEvent.click(screen.getByText('Load more'));
    fireEvent.click(await screen.findByText('Later'));
    expect(screen.getByText('2 selected')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Download export'));
    await waitFor(() => expect(portableApi.export).toHaveBeenCalledWith('app', ['a', 'b'], 'configuration'));
  });

  it('discards a late response after the workspace changes', async () => {
    let finish!: (value: Awaited<ReturnType<typeof portableApi.list>>) => void;
    vi.mocked(portableApi.list).mockReturnValueOnce(new Promise(resolve => { finish = resolve; }));
    const view = render(<ResourceTransferDialog {...props} />);
    view.rerender(<ResourceTransferDialog {...props} workspaceId="other" />);
    await screen.findByText('Projects');
    await act(async () => finish({ items: [{ id: 'private', name: 'Old private item' }], cursor: undefined }));
    expect(screen.queryByText('Old private item')).not.toBeInTheDocument();
  });
});
