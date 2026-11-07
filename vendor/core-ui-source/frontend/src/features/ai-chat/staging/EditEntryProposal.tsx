import { Pencil } from 'lucide-react';
import { useState } from 'react';
import { getEntryProposalForm, reviseEntryProposal, type EntryProposalFormItem } from '../../../api/agentive';
import { EntryFormExpandedView, useEntryExpandedForm } from '../../../components/entries/EntryFormExpanded';
import { AppSelect, Button } from '../../../components/ui';
import { Modal } from '../../../components/ui/Modal';
import { useToast } from '../../../context/ToastContext';
import { Text } from '../../../ui';
import type { Track } from '../../../types';
import type { StagedChange } from './types';
import { errorMessageFromAxios } from '../../../api/helpers';

const NO_TRACKS: Track[] = [];

/** Shared by the chat sheet, expanded review and approvals inbox. */
export function EditEntryProposal({ token, disabled = false, onRevised }: {
  token: string;
  disabled?: boolean;
  onRevised?: (staged: StagedChange) => void;
}) {
  const { showToast } = useToast();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [entries, setEntries] = useState<EntryProposalFormItem[]>([]);
  const [selected, setSelected] = useState(0);
  const [saving, setSaving] = useState(false);
  const load = async () => {
    setLoading(true);
    try {
      const result = await getEntryProposalForm(token);
      if (!result.ok || !result.entries?.length) throw new Error(result.message || 'This proposal has no editable records in an existing track.');
      setEntries(result.entries);
      setSelected(0);
      setOpen(true);
    } catch (error) {
      showToast(errorMessageFromAxios(error, error instanceof Error ? error.message : 'Could not load the proposed record.'), 'error');
    } finally {
      setLoading(false);
    }
  };
  return <>
    <Button type="button" size="sm" variant="ghost" disabled={disabled || loading} onClick={() => void load()}>
      <Pencil size={13} aria-hidden /> {loading ? 'Opening…' : 'Edit records'}
    </Button>
    <Modal open={open} onClose={() => { if (!saving) setOpen(false); }} title="Edit proposed record" width="max-w-dialog-wide">
      {entries.length > 1 ? <div className="px-5 pt-4">
        <label className="flex flex-col gap-1">
          <Text variant="label">Record to edit</Text>
          <AppSelect aria-label="Record to edit" value={String(selected)} disabled={saving} onValueChange={value => setSelected(Number(value))} options={entries.map((item, index) => ({value: String(index), label: `${item.entry.title || 'Untitled'} · ${item.track.title}`}))} />
        </label>
      </div> : null}
      {open && entries[selected] ? <ProposalForm key={`${token}:${selected}`} item={entries[selected]} saving={saving} onCancel={() => setOpen(false)} onSave={async draft => {
        setSaving(true);
        try {
          const result = await reviseEntryProposal(token, entries[selected], draft);
          if (!result.ok || !result.staged_change) throw new Error(result.message || 'Could not save this proposed change.');
          onRevised?.(result.staged_change);
          window.dispatchEvent(new Event('staging-state-changed'));
          setOpen(false);
          showToast('Edits saved for review. Approve the revised change when you are ready.', 'success');
        } catch (error) {
          showToast(errorMessageFromAxios(error, error instanceof Error ? error.message : 'Could not save this proposed change.'), 'error');
        } finally {
          setSaving(false);
        }
      }} /> : null}
    </Modal>
  </>;
}

function ProposalForm({ item, saving, onCancel, onSave }: {
  item: EntryProposalFormItem;
  saving: boolean;
  onCancel: () => void;
  onSave: (draft: { title: string; body: string; fields: Record<string, unknown>; tags: string[] }) => Promise<void>;
}) {
  const { showToast } = useToast();
  const form = useEntryExpandedForm({ mode: 'edit', enabled: true, relationsEnabled: true, track: item.track, tracksList: NO_TRACKS, needsTrackPicker: false, initialEntry: item.entry, proposalOnly: true, showToast });
  const { composerInviteText: _invite, composerActionLabel: _action, ...view } = form;
  return <>
    <div className="px-5 pt-4">
      <Text as="p" variant="meta" tone="muted">{item.track.title} · Changes stay pending until you approve. Existing attachments are retained; add new files after applying.</Text>
    </div>
    <EntryFormExpandedView {...view} loading={saving || form.loading} typeLocked hideAttachmentsRow hideLinkPreview primaryLabel={saving ? 'Saving…' : 'Save for review'} onCancel={onCancel} onPrimary={() => {
      if (saving || form.loading) return;
      const draft = form.getValidatedDraft?.();
      if (draft) void onSave(draft);
    }} />
  </>;
}
