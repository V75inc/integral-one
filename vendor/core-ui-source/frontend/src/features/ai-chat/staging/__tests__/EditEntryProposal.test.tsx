import { beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { EditEntryProposal } from '../EditEntryProposal';
import { getEntryProposalForm, reviseEntryProposal } from '../../../../api/agentive';

const { toast, formOptions, draft } = vi.hoisted(() => ({ toast: vi.fn(), formOptions: vi.fn(), draft: vi.fn() }));
vi.mock('../../../../context/ToastContext', () => ({ useToast: () => ({ showToast: toast }) }));
vi.mock('../../../../api/agentive', () => ({ getEntryProposalForm: vi.fn(), reviseEntryProposal: vi.fn() }));
vi.mock('../../../../components/entries/EntryFormExpanded', () => ({
  useEntryExpandedForm: (options: unknown) => { formOptions(options); return { getValidatedDraft: draft, loading: false }; },
  EntryFormExpandedView: ({ onPrimary, onCancel, primaryLabel, typeLocked, hideAttachmentsRow }: { onPrimary: () => void; onCancel: () => void; primaryLabel: string; typeLocked: boolean; hideAttachmentsRow: boolean }) => <div>
    <span>{typeLocked && hideAttachmentsRow ? 'Fixed destination and existing files retained' : 'unsafe'}</span>
    <button onClick={onPrimary}>{primaryLabel}</button><button onClick={onCancel}>Cancel</button>
  </div>,
}));

const item = { operation_index: 2, revision: 'a'.repeat(64), track: { id: 'track', title: 'Pantry' }, entry: { id: 'entry', title: 'Rice', custom_fields: { quantity: 2 } } };
const edited = { title: 'Rice', body: 'Keep dry', fields: { quantity: 4 }, tags: [] };

beforeEach(() => {
  cleanup(); vi.clearAllMocks();
  vi.mocked(getEntryProposalForm).mockResolvedValue({ ok: true, entries: [item] } as never);
  draft.mockReturnValue(edited);
});

describe('proposed record editor', () => {
  it('loads the full seed, saves a new pending proposal and never auto-approves it', async () => {
    const revised = { token: 'new-token', state: 'pending' };
    vi.mocked(reviseEntryProposal).mockResolvedValue({ ok: true, staged_change: revised } as never);
    const onRevised = vi.fn();
    render(<EditEntryProposal token="original-token" onRevised={onRevised} />);
    fireEvent.click(screen.getByRole('button', { name: 'Edit records' }));
    await screen.findByText('Fixed destination and existing files retained');
    expect(formOptions).toHaveBeenLastCalledWith(expect.objectContaining({ initialEntry: item.entry, track: item.track, proposalOnly: true, needsTrackPicker: false }));
    fireEvent.click(screen.getByRole('button', { name: 'Save for review' }));
    await waitFor(() => expect(onRevised).toHaveBeenCalledWith(revised));
    expect(reviseEntryProposal).toHaveBeenCalledWith('original-token', item, edited);
    expect(toast).toHaveBeenCalledWith(expect.stringContaining('Approve the revised change'), 'success');
  });

  it('cancelling or invalid input never replaces the original approval', async () => {
    render(<EditEntryProposal token="original-token" />);
    fireEvent.click(screen.getByRole('button', { name: 'Edit records' }));
    await screen.findByRole('button', { name: 'Save for review' });
    draft.mockReturnValue(null);
    fireEvent.click(screen.getByRole('button', { name: 'Save for review' }));
    expect(reviseEntryProposal).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(reviseEntryProposal).not.toHaveBeenCalled();
  });

  it('keeps the form open and displays a stale-record refusal', async () => {
    vi.mocked(reviseEntryProposal).mockResolvedValue({ ok: false, message: 'The record changed. Reload the form.' });
    const onRevised = vi.fn();
    render(<EditEntryProposal token="original-token" onRevised={onRevised} />);
    fireEvent.click(screen.getByRole('button', { name: 'Edit records' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Save for review' }));
    await waitFor(() => expect(toast).toHaveBeenCalledWith('The record changed. Reload the form.', 'error'));
    expect(onRevised).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Save for review' })).toBeInTheDocument();
  });
});
