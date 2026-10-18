/**
 * AppInstallModal — install flow UI for App bundles.
 *
 * Phase 10 Plan 10-05 (APP-SETTINGS-01). Resolves Open Question 7: a
 * 4-section capability prompt (Tracks / Tools / External APIs / Settings)
 * with Approve / Reject buttons. If the install response is
 * ``{status: "awaiting_settings"}`` the modal transitions to a settings
 * form view reusing ``AppSettingsForm``.
 *
 * Wire shape:
 *   POST /api/workspaces/{ws}/apps/install
 *     body: { library_operational_model_id }
 *     → 200 { status: "active", app_id, installed_at }
 *     → 200 { status: "awaiting_settings", app_id, install_token, settings_schema }
 *   POST /api/apps/{app_id}/install/settings
 *     body: { install_token, settings }
 *     → 200 { status: "active", app_id, installed_at }
 *
 * Selective-disable controls (per-capability accept/reject) are out of scope
 * for v1 — the install is accept-or-reject. Dependency prompts are surfaced
 * inline when the backend returns AppDependencyError.
 */

import React, { useState } from 'react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui';
import { AppSettingsFinalizeStep } from './AppSettingsFinalizeStep';
import { IncludeSeedDataToggle } from './IncludeSeedDataToggle';
import apiClient from '../../api/client';
import { useLifecycleWork } from '../../hooks/useLifecycleWork';

interface CapabilitySummary {
  tracks: { key: string; name: string }[];
  skills?: { key: string; kind: string }[];
  agents?: { key: string; name: string }[];
  tools: string[];
  external_apis: string[];
  settings_keys: string[];
  /**
   * Phase 10 Plan 10-06 — cross-App dependencies declared by the package.
   * Each entry mirrors the manifest ``requires_apps[]`` row.
   */
  requires_apps?: {
    key: string;
    min_version: string;
    optional: boolean;
    reason?: string;
  }[];
  /** Example entries declared in manifest ``app.seeds[]``. */
  seeds?: { track: string; count: number }[];
  seed_entry_count?: number;
}

interface AppInstallModalProps {
  open: boolean;
  onClose(): void;
  workspaceId: string;
  /** Library OperationalModel id (the package being installed). */
  libraryOperationalModelId: string;
  /** Pre-computed capability summary surfaced in the capability prompt. */
  capabilities: CapabilitySummary;
  /** Called with the new App id on successful install (active state). */
  onInstalled(appId: string): void;
}

type Phase =
  | 'capability_prompt'
  | 'settings_form'
  | 'installing'
  | 'queued';

export function AppInstallModal(props: AppInstallModalProps) {
  const {
    open,
    onClose,
    workspaceId,
    libraryOperationalModelId,
    capabilities,
    onInstalled,
  } = props;

  const [phase, setPhase] = useState<Phase>('capability_prompt');
  const [error, setError] = useState<string | null>(null);
  const [missingDeps, setMissingDeps] = useState<string[]>([]);
  const [settingsSchema, setSettingsSchema] = useState<Record<string, unknown> | null>(null);
  const [installToken, setInstallToken] = useState<string>('');
  const [pendingAppId, setPendingAppId] = useState<string>('');
  const [includeSeedData, setIncludeSeedData] = useState(true);
  const [queuedWorkItemId, setQueuedWorkItemId] = useState<string | null>(null);

  useLifecycleWork(queuedWorkItemId, {
    onSucceeded: appId => {
      onInstalled(appId);
      onClose();
    },
    onFailed: message => {
      setError(message);
      setQueuedWorkItemId(null);
      setPhase('capability_prompt');
    },
  });

  const seedEntryCount =
    capabilities.seed_entry_count ??
    (capabilities.seeds || []).reduce((sum, s) => sum + s.count, 0);

  async function handleApprove() {
    setPhase('installing');
    setError(null);
    setMissingDeps([]);
    try {
      const { data } = await apiClient.post(
        `/workspaces/${workspaceId}/apps/install`,
        {
          library_operational_model_id: libraryOperationalModelId,
          include_seed_data: includeSeedData,
        },
      );
      const result = data as {
        status: string;
        app_id: string;
        work_item_id?: string;
        install_token?: string;
        settings_schema?: Record<string, unknown>;
      };
      if (result.status === 'queued' && result.work_item_id) {
        setQueuedWorkItemId(result.work_item_id);
        setPhase('queued');
      } else if (result.status === 'awaiting_settings' && result.install_token) {
        setPendingAppId(result.app_id);
        setInstallToken(result.install_token);
        setSettingsSchema(result.settings_schema || {});
        setPhase('settings_form');
      } else if (result.status === 'active') {
        onInstalled(result.app_id);
        onClose();
      } else {
        setError(`Unexpected install status: ${result.status}`);
        setPhase('capability_prompt');
      }
    } catch (e) {
      const err = e as { response?: { data?: { error_code?: string; message?: string; details?: { missing_deps?: string[] } } } };
      const payload = err.response?.data;
      if (payload?.error_code === 'app_dependency_error') {
        setMissingDeps(payload.details?.missing_deps || []);
        setError(payload.message || 'Missing dependencies');
      } else {
        setError(payload?.message || 'Install failed');
      }
      setPhase('capability_prompt');
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Install App">
        {phase === 'capability_prompt' && (
          <>
            <Modal.Body>
            <CapabilitySection title="Tracks the App will create">
              {capabilities.tracks.length === 0 ? (
                <span className="text-xs text-[var(--text-subtle)]">None</span>
              ) : (
                <ul className="space-y-1 text-sm">
                  {capabilities.tracks.map(t => (
                    <li key={t.key}>
                      <span className="font-medium">{t.name}</span>{' '}
                      <span className="text-xs text-[var(--text-subtle)]">
                        ({t.key})
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </CapabilitySection>
            <CapabilitySection title="Skills the App provides">
              {(capabilities.skills?.length ?? 0) === 0 ? (
                <span className="text-xs text-[var(--text-subtle)]">None</span>
              ) : (
                <ul className="space-y-0.5 text-sm font-mono">
                  {capabilities.skills!.map(s => (
                    <li key={s.key}>
                      {s.key}{' '}
                      <span className="text-xs text-[var(--text-subtle)]">({s.kind})</span>
                    </li>
                  ))}
                </ul>
              )}
            </CapabilitySection>
            <CapabilitySection title="Agents the App registers">
              {(capabilities.agents?.length ?? 0) === 0 ? (
                <span className="text-xs text-[var(--text-subtle)]">None</span>
              ) : (
                <ul className="space-y-1 text-sm">
                  {capabilities.agents!.map(a => (
                    <li key={a.key}>
                      <span className="font-medium">{a.name}</span>{' '}
                      <span className="text-xs text-[var(--text-subtle)]">({a.key})</span>
                    </li>
                  ))}
                </ul>
              )}
            </CapabilitySection>
            <CapabilitySection title="Bundle tools the App may invoke">
              {capabilities.tools.length === 0 ? (
                <span className="text-xs text-[var(--text-subtle)]">None</span>
              ) : (
                <ul className="space-y-0.5 text-sm font-mono">
                  {capabilities.tools.map(t => (
                    <li key={t}>{t}</li>
                  ))}
                </ul>
              )}
            </CapabilitySection>
            <CapabilitySection title="External APIs declared">
              {capabilities.external_apis.length === 0 ? (
                <span className="text-xs text-[var(--text-subtle)]">None</span>
              ) : (
                <ul className="space-y-0.5 text-sm font-mono">
                  {capabilities.external_apis.map(a => (
                    <li key={a}>{a}</li>
                  ))}
                </ul>
              )}
            </CapabilitySection>
            <CapabilitySection title="Settings the App requests">
              {capabilities.settings_keys.length === 0 ? (
                <span className="text-xs text-[var(--text-subtle)]">None</span>
              ) : (
                <ul className="space-y-0.5 text-sm">
                  {capabilities.settings_keys.map(k => (
                    <li key={k}>{k}</li>
                  ))}
                </ul>
              )}
            </CapabilitySection>

            {(capabilities.seeds?.length || seedEntryCount > 0) && (
              <CapabilitySection title="Example entries the App may add">
                {capabilities.seeds && capabilities.seeds.length > 0 ? (
                  <ul className="space-y-1 text-sm">
                    {capabilities.seeds.map(s => (
                      <li key={s.track}>
                        <span className="font-medium">{s.track}</span>{' '}
                        <span className="text-xs text-[var(--text-subtle)]">
                          ({s.count} {s.count === 1 ? 'entry' : 'entries'})
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <span className="text-xs text-[var(--text-subtle)]">
                    {seedEntryCount} example{' '}
                    {seedEntryCount === 1 ? 'entry' : 'entries'}
                  </span>
                )}
              </CapabilitySection>
            )}

            <CapabilitySection title="Install options">
              <IncludeSeedDataToggle
                checked={includeSeedData}
                onChange={setIncludeSeedData}
                seedEntryCount={seedEntryCount}
              />
            </CapabilitySection>

            {capabilities.requires_apps && capabilities.requires_apps.length > 0 && (
              <CapabilitySection title="Apps this App depends on">
                <ul className="space-y-1 text-sm" data-testid="requires-apps-list">
                  {capabilities.requires_apps.map(dep => (
                    <li
                      key={dep.key}
                      className="flex items-baseline gap-2"
                      data-testid={`requires-apps-row-${dep.key}`}
                    >
                      <span className="font-medium">{dep.key}</span>
                      <span className="text-xs text-[var(--text-subtle)] font-mono">
                        {dep.optional ? 'optional' : 'required'}
                        {dep.min_version && dep.min_version !== '0.0.0'
                          ? `, ≥ ${dep.min_version}`
                          : ''}
                      </span>
                      {dep.reason ? (
                        <span className="text-xs text-[var(--text-subtle)]">
                          — {dep.reason}
                        </span>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </CapabilitySection>
            )}

            {missingDeps.length > 0 && (
              <div
                className="rounded-md border border-yellow-500 bg-yellow-50/20 px-3 py-2 text-sm"
                data-testid="missing-deps-banner"
              >
                <p className="font-medium mb-1">Install dependencies first:</p>
                <ul className="list-disc ml-5 text-xs">
                  {missingDeps.map(d => (
                    <li key={d}>{d}</li>
                  ))}
                </ul>
              </div>
            )}

            {error && (
              <p className="text-sm text-red-500" data-testid="install-error">
                {error}
              </p>
            )}
            </Modal.Body>
            <Modal.Footer>
              <Button variant="ghost" onClick={onClose}>
                Reject
              </Button>
              <Button onClick={handleApprove} data-testid="install-approve">
                Approve & install
              </Button>
            </Modal.Footer>
          </>
        )}

        {phase === 'installing' && (
          <Modal.Body>
            <p className="text-sm text-[var(--text-subtle)]">Installing…</p>
          </Modal.Body>
        )}

        {phase === 'queued' && (
          <>
            <Modal.Body>
              <p className="text-sm text-[var(--text-subtle)]">
                Installation has been queued. The App will appear when its lifecycle work completes.
              </p>
            </Modal.Body>
            <Modal.Footer>
              <Button variant="ghost" onClick={onClose}>Close</Button>
            </Modal.Footer>
          </>
        )}

        {phase === 'settings_form' && settingsSchema && (
          <AppSettingsFinalizeStep
            pending={{
              appId: pendingAppId,
              appName: 'App',
              installToken,
              settingsSchema,
            }}
            onComplete={appId => {
              onInstalled(appId);
              onClose();
            }}
            onFinishLater={onClose}
            onError={msg => setError(msg)}
          />
        )}

    </Modal>
  );
}

function CapabilitySection(props: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-md border border-[var(--panel-border)] p-3">
      <h3 className="text-xs uppercase tracking-wide text-[var(--text-subtle)] mb-1.5">
        {props.title}
      </h3>
      {props.children}
    </section>
  );
}
