/**
 * Post-install App settings editor — PATCH /apps/{id}/settings.
 *
 * Install-time settings use AppSettingsFinalizeStep; this modal is the
 * Settings page for an already-active App (invoice patterns, etc.).
 */
import { useEffect, useState } from 'react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui';
import { Text } from '../../ui';
import { AppFunctionAccess } from '../access/AppFunctionAccess';
import { AppSettingsForm } from './AppSettingsForm';
import { appsApi } from '../../api/apps';
import { errorMessageFromAxios } from '../../api/helpers';

function seedDefaultsFromSchema(
  schema: Record<string, unknown>
): Record<string, unknown> {
  const properties = (schema?.properties || {}) as Record<
    string,
    Record<string, unknown>
  >;
  const required = (schema?.required as string[] | undefined) || [];
  const seeded: Record<string, unknown> = {};
  for (const [key, prop] of Object.entries(properties)) {
    if (Object.prototype.hasOwnProperty.call(prop, 'default')) {
      seeded[key] = prop.default;
      continue;
    }
    const enumVals = prop.enum as unknown[] | undefined;
    const isArray = prop.type === 'array';
    if (required.includes(key) && !isArray && enumVals && enumVals.length) {
      seeded[key] = enumVals[0];
    }
  }
  return seeded;
}

export interface AppSettingsModalProps {
  open: boolean;
  appId: string;
  appName: string;
  onClose(): void;
  onSaved?(): void;
  /** Only supplied for a workspace owner; server checks remain authoritative. */
  functionAccessWorkspaceId?: string;
}

export function AppSettingsModal({
  open,
  appId,
  appName,
  onClose,
  onSaved,
  functionAccessWorkspaceId,
}: AppSettingsModalProps) {
  const [section, setSection] = useState<'settings' | 'access'>('settings');
  useEffect(() => { if (open) setSection('settings'); }, [open]);
  const [schema, setSchema] = useState<Record<string, unknown> | null>(null);
  const [value, setValue] = useState<Record<string, unknown>>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !appId) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    setSchema(null);
    appsApi
      .getAppSettings(appId)
      .then(res => {
        if (cancelled) return;
        const nextSchema = res.settings_schema || {};
        setSchema(nextSchema);
        setValue({
          ...seedDefaultsFromSchema(nextSchema),
          ...(res.settings || {}),
        });
      })
      .catch(err => {
        if (cancelled) return;
        setError(errorMessageFromAxios(err, 'Failed to load settings'));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, appId]);

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      await appsApi.updateAppSettings(appId, value);
      onSaved?.();
      onClose();
    } catch (err) {
      setError(errorMessageFromAxios(err, 'Failed to save settings'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={`${appName} settings`}>
      <Modal.Body>
        {functionAccessWorkspaceId && <div role="tablist" aria-label="App settings sections" className="mb-5 flex flex-wrap gap-2">
          <Button size="sm" role="tab" aria-selected={section === 'settings'} variant={section === 'settings' ? 'primary' : 'outline'} onClick={() => setSection('settings')}>Settings</Button>
          <Button size="sm" role="tab" aria-selected={section === 'access'} variant={section === 'access' ? 'primary' : 'outline'} onClick={() => setSection('access')}>Function access</Button>
        </div>}
        {section === 'access' && functionAccessWorkspaceId ? <>
          <Text variant="body-sm" tone="muted" as="p" className="mb-4">Manage permission to run App-defined operations. These grants do not replace access to App records.</Text>
          <AppFunctionAccess appId={appId} workspaceId={functionAccessWorkspaceId} />
        </> : <>
        {loading ? (
          <Text variant="body-sm" tone="subtle" as="p">
            Loading settings…
          </Text>
        ) : schema ? (
          <AppSettingsForm
            schema={schema}
            value={value}
            onChange={setValue}
            disabled={saving}
          />
        ) : null}
        {error ? (
          <Text
            variant="body-sm"
            tone="danger"
            as="p"
            className="mt-3"
            data-testid="app-settings-modal-error"
          >
            {error}
          </Text>
        ) : null}
        </>}
      </Modal.Body>
      {section === 'settings' ? <Modal.Footer align="between">
        <Button variant="ghost" onClick={onClose} disabled={saving}>
          Cancel
        </Button>
        <Button
          variant="primary"
          onClick={handleSave}
          loading={saving}
          disabled={loading || !schema}
          data-testid="app-settings-modal-save"
        >
          Save settings
        </Button>
      </Modal.Footer> : <Modal.Footer><Button variant="outline" onClick={onClose}>Done</Button></Modal.Footer>}
    </Modal>
  );
}
