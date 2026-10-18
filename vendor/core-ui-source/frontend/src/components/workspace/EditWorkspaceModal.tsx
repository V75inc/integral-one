import { useEffect, useState } from 'react';
import { Settings } from 'lucide-react';
import type { Workspace } from '../../api/workspaces';
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
          <label
            htmlFor="ws-edit-name"
            className="text-sm font-medium text-[var(--text)] block mb-1.5"
          >
            Name *
          </label>
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
          <label
            htmlFor="ws-edit-description"
            className="text-sm font-medium text-[var(--text)] block mb-1.5"
          >
            Description
          </label>
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

        <div className="rounded-[var(--radius-card)] border border-[var(--panel-border)] bg-[var(--panel-2)]/25 p-4 space-y-2">
          <p className="text-sm font-medium text-[var(--text)]">Identity color</p>
          <p className="text-xs text-[var(--text-muted)]">
            Pick a swatch to brand this workspace, or clear the selection to
            inherit the platform color.
          </p>
          <ColorPicker
            value={accentColor}
            onChange={setAccentColor}
            ariaLabel="Workspace identity color"
          />
        </div>
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
