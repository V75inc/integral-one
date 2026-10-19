/**
 * AppUninstallModal — explicit uninstall confirmation with hard dep gates.
 *
 * - Dependents / blocking refs → read-only blocker list (no force).
 * - Entry data → second confirmation step before POST.
 * - Clear leaf Apps → single confirm then POST /uninstall.
 */
import { useEffect, useState } from 'react';
import { Button } from '../ui';
import { Input, Text } from '../../ui';
import { FormDialog } from '../../templates';
import {
  appsApi,
  type UninstallBlockingDependent,
  type UninstallBlockingReference,
  type UninstallPreflightResponse,
} from '../../api/apps';
import { useLifecycleWork } from '../../hooks/useLifecycleWork';

interface AppUninstallModalProps {
  open: boolean;
  onClose(): void;
  appId: string;
  appName: string;
  /** Optional prefetched preflight; otherwise loaded on open. */
  preflight?: UninstallPreflightResponse | null;
  /** Called with the uninstalled App id on success. */
  onUninstalled(appId: string): void;
}

type Phase =
  | 'loading'
  | 'blocked'
  | 'confirm'
  | 'data_confirm'
  | 'uninstalling'
  | 'queued';

const CONFIRM_TOKEN = 'UNINSTALL';

export function AppUninstallModal(props: AppUninstallModalProps) {
  const { open, onClose, appId, appName, preflight: prefetched, onUninstalled } =
    props;
  const [phase, setPhase] = useState<Phase>('loading');
  const [error, setError] = useState<string | null>(null);
  const [preflight, setPreflight] = useState<UninstallPreflightResponse | null>(
    prefetched ?? null,
  );
  const [confirmText, setConfirmText] = useState('');
  const [queuedWorkItemId, setQueuedWorkItemId] = useState<string | null>(null);

  useLifecycleWork(queuedWorkItemId, {
    onSucceeded: completedAppId => {
      onUninstalled(completedAppId);
      onClose();
    },
    onFailed: message => {
      setError(message);
      setQueuedWorkItemId(null);
      setPhase(
        preflight?.requires_data_confirmation ? 'data_confirm' : 'confirm',
      );
    },
  });

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setError(null);
    setConfirmText('');
    setQueuedWorkItemId(null);

    if (prefetched) {
      setPreflight(prefetched);
      setPhase(phaseFromPreflight(prefetched));
      return;
    }

    setPhase('loading');
    setPreflight(null);
    (async () => {
      try {
        const pf = await appsApi.uninstallPreflight(appId);
        if (cancelled) return;
        setPreflight(pf);
        setPhase(phaseFromPreflight(pf));
      } catch (e) {
        if (cancelled) return;
        const err = e as { response?: { data?: { message?: string } }; message?: string };
        setError(
          err.response?.data?.message ||
            err.message ||
            'Failed to load uninstall readiness.',
        );
        setPhase('blocked');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, appId, prefetched]);

  async function handleUninstall() {
    setPhase('uninstalling');
    setError(null);
    try {
      const result = await appsApi.uninstall(appId);
      if (result.status === 'queued') {
        setQueuedWorkItemId(result.work_item_id);
        setPhase('queued');
      } else if (result.status === 'uninstalled') {
        onUninstalled(result.app_id);
        onClose();
      } else {
        setError(`Unexpected uninstall status: ${(result as { status: string }).status}`);
        setPhase(preflight?.requires_data_confirmation ? 'data_confirm' : 'confirm');
      }
    } catch (e) {
      const err = e as {
        response?: {
          status?: number;
          data?: {
            error_code?: string;
            message?: string;
            details?: {
              blocking_dependents?: UninstallBlockingDependent[];
              blocking_references?: UninstallBlockingReference[];
            };
          };
        };
      };
      const payload = err.response?.data;
      if (
        err.response?.status === 409 &&
        payload?.error_code === 'app_uninstall_blocked'
      ) {
        setPreflight(prev =>
          prev
            ? {
                ...prev,
                can_uninstall: false,
                blocking_dependents:
                  payload.details?.blocking_dependents ||
                  prev.blocking_dependents,
                blocking_references:
                  payload.details?.blocking_references ||
                  prev.blocking_references,
              }
            : {
                app_id: appId,
                can_uninstall: false,
                blocking_dependents:
                  payload.details?.blocking_dependents || [],
                blocking_references:
                  payload.details?.blocking_references || [],
                entry_count: 0,
                requires_data_confirmation: false,
              },
        );
        setError(payload.message || 'Uninstall blocked by dependents.');
        setPhase('blocked');
      } else {
        setError(payload?.message || 'Uninstall failed');
        setPhase(
          preflight?.requires_data_confirmation ? 'data_confirm' : 'confirm',
        );
      }
    }
  }

  if (phase === 'loading') {
    return (
      <FormDialog open={open} onClose={onClose} title={`Uninstall ${appName}`} noActions>
        <Text variant="body" tone="subtle" as="p" data-testid="uninstall-loading">
          Checking whether this App can be uninstalled…
        </Text>
      </FormDialog>
    );
  }

  if (phase === 'blocked') {
    const deps = preflight?.blocking_dependents || [];
    const refs = preflight?.blocking_references || [];
    return (
      <FormDialog
        open={open}
        onClose={onClose}
        title={`Uninstall ${appName}`}
        actions={
          <Button variant="ghost" onClick={onClose} data-testid="uninstall-close">
            Close
          </Button>
        }
      >
        <Text variant="body" as="p">
          This App cannot be uninstalled while other Apps depend on it or
          hold blocking references. Uninstall those Apps first (leaves first).
        </Text>
        {deps.length > 0 && (
          <div
            className="rounded-md border border-red-500 bg-red-50/20 px-3 py-2 text-sm mt-3"
            data-testid="blocking-deps-banner"
          >
            <Text variant="body-sm" weight="medium" as="p" className="mb-1">
              Dependent Apps:
            </Text>
            <ul className="list-disc ml-5 text-xs">
              {deps.map(d => (
                <li key={d.app_id}>
                  <Text variant="body-sm" weight="medium">
                    {d.app_name || 'Untitled app'}
                  </Text>
                  {d.dep_key ? (
                    <Text variant="body-sm" tone="subtle">
                      {' '}
                      (depends on: {d.dep_key})
                    </Text>
                  ) : null}
                </li>
              ))}
            </ul>
          </div>
        )}
        {refs.length > 0 && (
          <div
            className="rounded-md border border-amber-500 bg-amber-50/20 px-3 py-2 text-sm mt-3"
            data-testid="blocking-refs-banner"
          >
            <Text variant="body-sm" weight="medium" as="p" className="mb-1">
              Blocking cross-App references ({refs.length}):
            </Text>
            <ul className="list-disc ml-5 text-xs space-y-0.5">
              {Object.entries(
                refs.reduce<Record<string, number>>((acc, r) => {
                  const key = r.source_app_id;
                  acc[key] = (acc[key] || 0) + 1;
                  return acc;
                }, {}),
              ).map(([refAppName, count]) => (
                <li key={refAppName}>
                  <Text variant="body-sm" weight="medium">
                    {refs.find(ref => ref.source_app_id === refAppName)?.source_app_name || 'Untitled app'}
                  </Text>
                  :{' '}
                  <Text variant="body-sm" tone="subtle">
                    {count} reference{count !== 1 ? 's' : ''}
                  </Text>
                </li>
              ))}
            </ul>
          </div>
        )}
        {error && (
          <Text variant="body" tone="danger" as="p" data-testid="uninstall-error">
            {error}
          </Text>
        )}
      </FormDialog>
    );
  }

  if (phase === 'confirm') {
    return (
      <FormDialog
        open={open}
        onClose={onClose}
        title={`Uninstall ${appName}`}
        actions={
          <>
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (preflight?.requires_data_confirmation) {
                  setPhase('data_confirm');
                  return;
                }
                void handleUninstall();
              }}
              data-testid="uninstall-confirm"
            >
              Continue
            </Button>
          </>
        }
      >
        <Text variant="body" as="p">
          Uninstalling an App archives its Tracks by default. Entries are
          preserved; agents and scheduled runs are unregistered.
        </Text>
        {error && (
          <Text variant="body" tone="danger" as="p" data-testid="uninstall-error">
            {error}
          </Text>
        )}
      </FormDialog>
    );
  }

  if (phase === 'data_confirm') {
    const count = preflight?.entry_count ?? 0;
    const ready = confirmText.trim().toUpperCase() === CONFIRM_TOKEN;
    return (
      <FormDialog
        open={open}
        onClose={onClose}
        title={`Confirm data — ${appName}`}
        actions={
          <>
            <Button variant="ghost" onClick={() => setPhase('confirm')}>
              Back
            </Button>
            <Button
              variant="danger"
              onClick={() => void handleUninstall()}
              disabled={!ready}
              data-testid="uninstall-data-confirm"
            >
              Uninstall
            </Button>
          </>
        }
      >
        <div data-testid="uninstall-data-warning">
          <Text variant="body" as="p">
            This App still has {count} entr{count === 1 ? 'y' : 'ies'}. Uninstall
            will archive the App and its Tracks; entry data remains but the App
            is removed from the workspace library.
          </Text>
        </div>
        <Text variant="body-sm" tone="subtle" as="p" className="mt-3 mb-2">
          Type <code className="font-mono">{CONFIRM_TOKEN}</code> to confirm.
        </Text>
        <Input
          value={confirmText}
          onChange={e => setConfirmText(e.target.value)}
          placeholder={CONFIRM_TOKEN}
          data-testid="uninstall-data-token"
          autoComplete="off"
        />
        {error && (
          <Text variant="body" tone="danger" as="p" data-testid="uninstall-error">
            {error}
          </Text>
        )}
      </FormDialog>
    );
  }

  if (phase === 'queued') {
    return (
      <FormDialog
        open={open}
        onClose={onClose}
        title={`Uninstall ${appName}`}
        actions={
          <Button variant="ghost" onClick={onClose}>
            Close
          </Button>
        }
      >
        <Text variant="body" tone="subtle" as="p">
          Uninstall has been queued. This App will remain visible until its
          lifecycle work completes.
        </Text>
      </FormDialog>
    );
  }

  // phase === 'uninstalling'
  return (
    <FormDialog open={open} onClose={onClose} title={`Uninstall ${appName}`} noActions>
      <Text variant="body" tone="subtle" as="p">
        Uninstalling…
      </Text>
    </FormDialog>
  );
}

function phaseFromPreflight(pf: UninstallPreflightResponse): Phase {
  if (!pf.can_uninstall) return 'blocked';
  return 'confirm';
}
