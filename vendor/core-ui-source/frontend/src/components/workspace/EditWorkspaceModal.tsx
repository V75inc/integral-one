import { useEffect, useState } from 'react';
import { Settings } from 'lucide-react';
import { workspacesApi, type Workspace } from '../../api/workspaces';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Surface, Text } from '../../ui';
import { Button, ColorPicker, LINE_ICON_STROKE, Modal } from '../ui';
import { parseTrackAccentHex } from '../../utils';

export interface EditWorkspaceModalProps {
  open: boolean;
  workspace: Workspace;
  onClose: () => void;
  onSave: (body: {
    name: string;
    description?: string;
    accent_color?: string;
  }) => Promise<void>;
  saving?: boolean;
  error?: string | null;
}

function ResidentAssignmentSetting({ workspaceId }: { workspaceId: string }) {
  const client = useQueryClient();
  const queryKey = ['workspace-resident-assignment-settings', workspaceId];
  const settings = useQuery({
    queryKey,
    queryFn: () => workspacesApi.getResidentAssignmentSettings(workspaceId),
    retry: false,
  });
  const update = useMutation({
    mutationFn: (enabled: boolean) => workspacesApi.setResidentAssignmentSettings(workspaceId, enabled),
    onSuccess: result => client.setQueryData(queryKey, result),
  });
  const enabled = settings.data?.enabled;
  return (
    <section aria-label="Resident assignment" className="space-y-2">
      <Text as="p" variant="body-sm" weight="medium">Resident assignment</Text>
      <Text as="p" variant="meta" tone="muted">
        Let members with Entry edit access assign work to Integral. This setting enables assignment intake only.
      </Text>
      <Button
        variant="secondary"
        disabled={enabled === undefined || update.isPending}
        onClick={() => update.mutate(!enabled)}
      >
        {enabled ? 'Disable resident assignment' : 'Enable resident assignment'}
      </Button>
      {settings.isError || update.isError ? (
        <div role="alert">
          <Text as="p" variant="meta">
            {settings.isError ? 'Could not load resident assignment settings.' : 'Could not save resident assignment settings.'}
          </Text>
        </div>
      ) : null}
    </section>
  );
}

export function EditWorkspaceModal({
  open,
  workspace,
  onClose,
  onSave,
  saving = false,
  error = null,
}: EditWorkspaceModalProps) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [accentColor, setAccentColor] = useState<string | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setName(workspace.name ?? '');
    setDescription(workspace.description ?? '');
    setAccentColor(
      workspace.accent_color
        ? parseTrackAccentHex(workspace.accent_color)
        : null,
    );
    setLocalError(null);
  }, [open, workspace]);

  const handleSave = async () => {
    if (!name.trim()) {
      setLocalError('Workspace name is required');
      return;
    }
    if (accentColor && !parseTrackAccentHex(accentColor)) {
      setLocalError('Identity color must be a #RGB or #RRGGBB hex value');
      return;
    }
    setLocalError(null);
    const resolvedAccent = accentColor
      ? parseTrackAccentHex(accentColor) || ''
      : '';
    await onSave({
      name: name.trim(),
      description: description.trim() || undefined,
      ...(resolvedAccent ? { accent_color: resolvedAccent } : { accent_color: '' }),
    });
  };

  const displayError = localError || error;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Workspace settings"
      titleIcon={<Settings size={14} strokeWidth={LINE_ICON_STROKE} />}
    >
      <Modal.Body>
        <div>
          <Text as="label" htmlFor="ws-edit-name" variant="body" weight="medium" className="block mb-1.5">
            Name *
          </Text>
          <input
            id="ws-edit-name"
            type="text"
            className="app-input"
            value={name}
            onChange={e => setName(e.target.value)}
            disabled={saving}
            placeholder="Workspace name"
            maxLength={120}
            autoFocus
          />
        </div>

        <div>
          <Text as="label" htmlFor="ws-edit-description" variant="body" weight="medium" className="block mb-1.5">
            Description
          </Text>
          <textarea
            id="ws-edit-description"
            className="app-input resize-none"
            rows={3}
            value={description}
            onChange={e => setDescription(e.target.value)}
            disabled={saving}
            placeholder="Optional description"
            maxLength={500}
          />
        </div>

        <Surface tone="panel-2" backgroundOpacity={30} border="default" radius="card" padding="md" className="space-y-2">
          <Text as="p" variant="body" weight="medium">Identity color</Text>
          <Text as="p" variant="body-sm" tone="muted">
            Pick a swatch to brand this workspace, or clear the selection to
            inherit the platform color.
          </Text>
          <ColorPicker
            value={accentColor}
            onChange={setAccentColor}
            ariaLabel="Workspace identity color"
          />
        </Surface>
        {open ? <ResidentAssignmentSetting key={workspace.id} workspaceId={workspace.id} /> : null}
      </Modal.Body>
      {displayError ? (
        <p className="px-6 -mt-2 text-xs text-[var(--danger-fg,#b91c1c)]" role="alert">
          {displayError}
        </p>
      ) : null}
      <Modal.Footer>
        <Button variant="ghost" onClick={onClose} disabled={saving}>
          Cancel
        </Button>
        <Button
          variant="primary"
          onClick={handleSave}
          disabled={saving || !name.trim()}
          loading={saving}
        >
          Save changes
        </Button>
      </Modal.Footer>
    </Modal>
  );
}
