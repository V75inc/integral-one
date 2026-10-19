/**
 * Settings finalize step — shared by AppInstallModal and AppManagerDialog.
 */
import { useState } from 'react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui';
import { Text } from '../../ui';
import { AppSettingsForm } from './AppSettingsForm';
import { appsApi } from '../../api/apps';
import { useLifecycleWork } from '../../hooks/useLifecycleWork';

/**
 * Seed initial settings state from the schema's declared defaults.
 *
 * Without this, the form state starts as ``{}`` while the native inputs
 * *display* a value (a required ``<select>`` with no empty option shows its
 * first enum entry; a multi_select shows its default chips). Submitting then
 * omits those keys entirely and the backend rejects the install with
 * "Settings failed schema validation: '<key>' is a required property" — even
 * though the user saw a valid value on screen (June 29 QA #1). Seeding makes
 * what's shown match what's submitted.
 *
 * Precedence per key: explicit ``default`` → for a required enum with no
 * default, its first option (mirrors what the native select renders).
 */
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
    // Required single-select enum with no explicit default: the native
    // <select> visually lands on the first option, so bind it for real.
    const enumVals = prop.enum as unknown[] | undefined;
    const isArray = prop.type === 'array';
    if (required.includes(key) && !isArray && enumVals && enumVals.length) {
      seeded[key] = enumVals[0];
    }
  }
  return seeded;
}

export interface PendingSettingsInstall {
  appId: string;
  appName: string;
  installToken: string;
  settingsSchema: Record<string, unknown>;
}

interface AppSettingsFinalizeStepProps {
  pending: PendingSettingsInstall;
  onComplete(appId: string): void;
  onFinishLater(): void;
  onError(message: string): void;
}

export function AppSettingsFinalizeStep({
  pending,
  onComplete,
  onFinishLater,
  onError,
}: AppSettingsFinalizeStepProps) {
  const [settingsValue, setSettingsValue] = useState<Record<string, unknown>>(
    () => seedDefaultsFromSchema(pending.settingsSchema)
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [queued, setQueued] = useState(false);
  const [queuedWorkItemId, setQueuedWorkItemId] = useState<string | null>(null);

  useLifecycleWork(queuedWorkItemId, {
    onSucceeded: onComplete,
    onFailed: message => {
      setQueued(false);
      setQueuedWorkItemId(null);
      setError(message);
      onError(message);
    },
  });

  async function handleSubmit() {
    setSubmitting(true);
    setError(null);
    try {
      const result = await appsApi.finalizeInstall(pending.appId, {
        install_token: pending.installToken,
        settings: settingsValue,
      });
      if (result.status === 'queued') {
        setQueuedWorkItemId(result.work_item_id);
        setQueued(true);
      } else {
        onComplete(result.app_id);
      }
    } catch (e) {
      const msg =
        (e as { response?: { data?: { message?: string } } })?.response?.data
          ?.message || 'Settings submit failed';
      setError(msg);
      onError(msg);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <Modal.Body>
        {queued ? (
          <Text variant="body-sm" tone="subtle" as="p" data-testid="settings-queued">
            Settings were accepted and finishing installation has been queued.
            The App will become available when its lifecycle work completes.
          </Text>
        ) : (
          <>
            <Text variant="body-sm" tone="subtle" as="p" className="mb-4">
              <Text as="span" variant="body-sm" weight="medium">
                {pending.appName}
              </Text>{' '}
              needs settings before it can finish installing.
            </Text>
            <AppSettingsForm
              schema={pending.settingsSchema}
              value={settingsValue}
              onChange={setSettingsValue}
              disabled={submitting}
            />
            {error && (
              <Text
                variant="body-sm"
                tone="danger"
                as="p"
                className="mt-3"
                data-testid="settings-error"
              >
                {error}
              </Text>
            )}
          </>
        )}
      </Modal.Body>
      <Modal.Footer align="between">
        {queued ? (
          <Button variant="primary" onClick={onFinishLater}>
            Close
          </Button>
        ) : (
          <>
            <Button variant="ghost" onClick={onFinishLater} disabled={submitting}>
              Finish later
            </Button>
            <Button
              variant="primary"
              onClick={handleSubmit}
              loading={submitting}
              data-testid="settings-submit"
            >
              Save &amp; finish install
            </Button>
          </>
        )}
      </Modal.Footer>
    </>
  );
}
