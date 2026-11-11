import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { aiChatApi } from '../../../../api/aiChat';
import { DocumentDraftCard, extractDocumentDrafts } from '../DocumentDrafts';

vi.mock('../../../../api/aiChat', () => ({ aiChatApi: { downloadDocumentDraft: vi.fn(), previewDocumentDraft: vi.fn() } }));
afterEach(() => { cleanup(); vi.restoreAllMocks(); });
beforeEach(() => { vi.resetAllMocks(); });

const result = { ok: true, _kind: 'document_draft', thread_id: 'n.ChatThread.example',
  key: 'report', version: 1, title: 'Research report', format: 'docx' };

describe('document drafts', () => {
  it('recognizes and deduplicates server-shaped results', () => {
    const part = { type: 'tool-call', result: { publicSummary: { document_draft: result } } };
    expect(extractDocumentDrafts([part], [part])).toEqual([{
      threadId: 'n.ChatThread.example', key: 'report', version: 1,
      title: 'Research report', format: 'docx',
    }]);
    expect(extractDocumentDrafts([{ ...part, result: { publicSummary: { document_draft: { ...result, format: 'exe' } } } }], [])).toEqual([]);
  });

  it('downloads the exact version through the authenticated API', async () => {
    vi.mocked(aiChatApi.downloadDocumentDraft).mockResolvedValue({ blob: new Blob(['draft']), filename: 'Named report.docx' });
    const create = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:draft');
    const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    render(<DocumentDraftCard draft={{ threadId: 'n.ChatThread.example', key: 'report',
      version: 1, title: 'Research report', format: 'docx' }} />);
    fireEvent.click(screen.getByRole('button', { name: 'Download draft' }));
    await waitFor(() => expect(click).toHaveBeenCalledOnce());
    expect(aiChatApi.downloadDocumentDraft).toHaveBeenCalledWith('n.ChatThread.example', 'report', 1);
    expect(click.mock.instances[0]).toEqual(expect.objectContaining({ download: 'Named report.docx' }));
    expect(create).toHaveBeenCalledOnce();
    expect(revoke).toHaveBeenCalledWith('blob:draft');
  });

  it('surfaces a failed or stale download', async () => {
    vi.mocked(aiChatApi.downloadDocumentDraft).mockRejectedValue(new Error('conflict'));
    render(<DocumentDraftCard draft={{ threadId: 'n.ChatThread.example', key: 'report',
      version: 1, title: 'Research report', format: 'pdf' }} />);
    fireEvent.click(screen.getByRole('button', { name: 'Download draft' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('may have changed');
  });

  it('loads the exact draft preview and refetches it after closing', async () => {
    vi.mocked(aiChatApi.previewDocumentDraft).mockResolvedValue({
      title: 'Guide', body: '## Start here\n\nReport hazards.', format: 'docx', version: 2,
    });
    render(<DocumentDraftCard draft={{ threadId: 'n.ChatThread.example', key: 'report',
      version: 2, title: 'Document', format: 'docx' }} />);
    fireEvent.click(screen.getByRole('button', { name: 'Preview draft' }));
    expect(await screen.findByText('Report hazards.')).toBeInTheDocument();
    expect(aiChatApi.previewDocumentDraft).toHaveBeenCalledWith('n.ChatThread.example', 'report', 2);
    fireEvent.click(screen.getByRole('button', { name: 'Close preview' }));
    expect(screen.queryByText('Report hazards.')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Preview draft' }));
    await waitFor(() => expect(aiChatApi.previewDocumentDraft).toHaveBeenCalledTimes(2));
  });

  it('does not repeat the title when the document starts with it', async () => {
    vi.mocked(aiChatApi.previewDocumentDraft).mockResolvedValue({
      title: 'Guide', body: '# Guide\n\nWelcome.', format: 'docx', version: 1,
    });
    render(<DocumentDraftCard draft={{ threadId: 'n.ChatThread.example', key: 'report',
      version: 1, title: 'Document', format: 'docx' }} />);
    fireEvent.click(screen.getByRole('button', { name: 'Preview draft' }));
    expect(await screen.findByText('Welcome.')).toBeInTheDocument();
    expect(screen.getAllByText('Guide')).toHaveLength(1);
  });
});
