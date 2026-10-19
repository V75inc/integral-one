/**
 * App Manager — install / uninstall library app bundles in one dialog.
 */
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Check, ExternalLink, Loader2, Package } from 'lucide-react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui';
import { AppIcon, Input, Surface, Text, Textarea } from '../../ui';
import { IncludeSeedDataToggle } from './IncludeSeedDataToggle';
import { countManifestSeedEntries } from '../../utils/manifestSeeds';
import {
  appsApi,
  type BatchInstallResponse,
  type UninstallPreflightResponse,
} from '../../api/apps';
import { operationalModelsApi } from '../../api/operationalModels';
import type { App, OperationalModelNode } from '../../types';
import { summarizeLibraryManifest } from '../../lib/operationalModelManifest';
import {
  extractPackageMeta,
  filterAppScopedLibraryPackages,
  filterWorkspaceVisibleLibraryPackages,
  isBundleBackedApp,
  isPackageInstalled,
  lifecycleBadge,
} from './appBundleMatching';
import {
  AppSettingsFinalizeStep,
  type PendingSettingsInstall,
} from './AppSettingsFinalizeStep';
import { AppUninstallModal } from './AppUninstallModal';
import { useAuth } from '../../context/AuthContext';
import { useConfirm } from '../../context/ConfirmContext';
import { useScope } from '../../context/ScopeContext';
import { useToast } from '../../context/ToastContext';
import { isSamePrincipal } from '../../utils';
import {
  resolveInstallDenial,
  type InstallDenialAction,
} from '../../host/registry';

const LINE_STROKE = 1.5;

interface SelectedInstallRow {
  library_cp_id: string;
  name: string;
  description: string;
  default_name: string;
  default_description: string;
}

export interface AppManagerDialogProps {
  isOpen: boolean;
  onClose: () => void;
  apps: App[];
  onChanged?: () => void;
  onCreateBlankApp?: () => void;
}

interface ManagerResults {
  batch?: BatchInstallResponse;
  uninstalled: Array<{ app_id: string; name: string }>;
  uninstallQueued: Array<{
    app_id: string;
    name: string;
    work_item_id: string;
  }>;
  uninstallFailed: Array<{ app_id: string; name: string; error: string }>;
  uninstallBlocked: Array<{ app_id: string; name: string }>;
}

type DialogPhase = 'manage' | 'settings' | 'results';

export function AppManagerDialog({
  isOpen,
  onClose,
  apps,
  onChanged,
  onCreateBlankApp,
}: AppManagerDialogProps) {
  const { user } = useAuth();
  const { scope } = useScope();
  const workspaceId = scope?.workspaceId;
  const confirm = useConfirm();
  const toast = useToast();
  const [profiles, setProfiles] = useState<OperationalModelNode[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [denialAction, setDenialAction] = useState<InstallDenialAction | null>(
    null,
  );
  const [phase, setPhase] = useState<DialogPhase>('manage');
  const [selectedInstall, setSelectedInstall] = useState<
    Map<string, SelectedInstallRow>
  >(new Map());
  const [submitting, setSubmitting] = useState(false);
  const [includeSeedData, setIncludeSeedData] = useState(true);
  const [results, setResults] = useState<ManagerResults | null>(null);
  const [settingsQueue, setSettingsQueue] = useState<PendingSettingsInstall[]>(
    [],
  );
  const [settingsIndex, setSettingsIndex] = useState(0);
  const [preflights, setPreflights] = useState<
    Map<string, UninstallPreflightResponse>
  >(new Map());
  const [uninstallTarget, setUninstallTarget] = useState<{
    appId: string;
    appName: string;
  } | null>(null);
  const [deletingPackages, setDeletingPackages] = useState<Set<string>>(
    new Set(),
  );

  const bundleApps = useMemo(
    () =>
      apps.filter(
        a =>
          isBundleBackedApp(a) &&
          a.lifecycle_state !== 'uninstalled',
      ),
    [apps],
  );

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    setDenialAction(null);
    setResults(null);
    setPhase('manage');
    setSelectedInstall(new Map());
    setIncludeSeedData(true);
    setSettingsQueue([]);
    setSettingsIndex(0);
    setPreflights(new Map());
    setUninstallTarget(null);
    (async () => {
      try {
        const data = await operationalModelsApi.list();
        if (cancelled) return;
        const libs = filterAppScopedLibraryPackages(
          filterWorkspaceVisibleLibraryPackages(data, workspaceId),
        );
        libs.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
        setProfiles(libs);
      } catch (err) {
        if (cancelled) return;
        setError(
          (err as { message?: string })?.message ||
            'Failed to load library packages.',
        );
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isOpen, workspaceId]);

  useEffect(() => {
    if (!isOpen || bundleApps.length === 0) {
      setPreflights(new Map());
      return;
    }
    let cancelled = false;
    void (async () => {
      const next = new Map<string, UninstallPreflightResponse>();
      await Promise.all(
        bundleApps.map(async row => {
          try {
            const pf = await appsApi.uninstallPreflight(row.id);
            next.set(row.id, pf);
          } catch {
            // Missing preflight leaves Uninstall enabled until known.
          }
        }),
      );
      if (!cancelled) setPreflights(next);
    })();
    return () => {
      cancelled = true;
    };
  }, [isOpen, bundleApps]);

  const toggleInstall = (profile: OperationalModelNode) => {
    if (isPackageInstalled(profile, apps)) return;
    setSelectedInstall(prev => {
      const next = new Map(prev);
      if (next.has(profile.id)) {
        next.delete(profile.id);
      } else {
        const { name, description } = extractPackageMeta(profile);
        next.set(profile.id, {
          library_cp_id: profile.id,
          name,
          description,
          default_name: name,
          default_description: description,
        });
      }
      return next;
    });
  };

  async function deleteTemplate(profile: OperationalModelNode) {
    const ok = await confirm({
      title: 'Delete saved template?',
      message: `Remove “${profile.name}” from Manage Apps? Apps already installed from it will remain installed.`,
      confirmLabel: 'Delete template',
      variant: 'danger',
    });
    if (!ok) return;
    setDeletingPackages(prev => new Set(prev).add(profile.id));
    try {
      await operationalModelsApi.delete(profile.id);
      setProfiles(prev => prev.filter(item => item.id !== profile.id));
      setSelectedInstall(prev => {
        const next = new Map(prev);
        next.delete(profile.id);
        return next;
      });
      toast.showToast('Template deleted.', 'success');
      onChanged?.();
    } catch (err) {
      setError(
        (err as { message?: string })?.message || 'Failed to delete template.',
      );
    } finally {
      setDeletingPackages(prev => {
        const next = new Set(prev);
        next.delete(profile.id);
        return next;
      });
    }
  }

  const updateInstallRow = (
    library_cp_id: string,
    patch: Partial<SelectedInstallRow>,
  ) => {
    setSelectedInstall(prev => {
      const next = new Map(prev);
      const cur = next.get(library_cp_id);
      if (!cur) return prev;
      next.set(library_cp_id, { ...cur, ...patch });
      return next;
    });
  };

  const selectedInstallCount = selectedInstall.size;
  const selectedSeedEntryCount = useMemo(() => {
    let total = 0;
    for (const row of selectedInstall.values()) {
      const profile = profiles.find(p => p.id === row.library_cp_id);
      total += countManifestSeedEntries(profile?.manifest || {});
    }
    return total;
  }, [profiles, selectedInstall]);

  const applyLabel = submitting
    ? 'Installing…'
    : selectedInstallCount === 0
      ? 'Install selected'
      : `Install selected (${selectedInstallCount})`;

  async function resumeSettingsForApp(app: App): Promise<PendingSettingsInstall | null> {
    const libraryId = app.installed_from_library_id;
    if (!libraryId) return null;
    try {
      const batch = await appsApi.batchInstall(
        [{ library_cp_id: libraryId }],
        { include_seed_data: includeSeedData },
      );
      const row = batch.installed.find(i => i.app_id === app.id);
      if (
        row?.status === 'awaiting_settings' &&
        row.install_token &&
        row.settings_schema
      ) {
        return {
          appId: app.id,
          appName: app.name,
          installToken: row.install_token,
          settingsSchema: row.settings_schema,
        };
      }
    } catch {
      // fall through to settings endpoint
    }
    try {
      const settingsRes = await appsApi.getAppSettings(app.id);
      const batch = await appsApi.batchInstall([{ library_cp_id: libraryId }]);
      const row = batch.installed.find(i => i.app_id === app.id);
      if (row?.install_token && settingsRes.settings_schema) {
        return {
          appId: app.id,
          appName: app.name,
          installToken: row.install_token,
          settingsSchema: settingsRes.settings_schema,
        };
      }
    } catch {
      return null;
    }
    return null;
  }

  async function applyChanges() {
    if (selectedInstallCount === 0) return;
    setSubmitting(true);
    setError(null);
    setDenialAction(null);
    const outcome: ManagerResults = {
      uninstalled: [],
      uninstallQueued: [],
      uninstallFailed: [],
      uninstallBlocked: [],
    };
    const pendingSettings: PendingSettingsInstall[] = [];

    try {
      const items = Array.from(selectedInstall.values()).map(row => ({
        library_cp_id: row.library_cp_id,
        name: row.name !== row.default_name ? row.name : undefined,
        description:
          row.description !== row.default_description
            ? row.description
            : undefined,
      }));
      outcome.batch = await appsApi.batchInstall(items, {
        include_seed_data: includeSeedData,
      });
      for (const row of outcome.batch.installed) {
        if (
          row.status === 'awaiting_settings' &&
          row.app_id &&
          row.install_token &&
          row.settings_schema
        ) {
          pendingSettings.push({
            appId: row.app_id,
            appName: row.name || 'Untitled app',
            installToken: row.install_token,
            settingsSchema: row.settings_schema,
          });
        }
      }

      if (pendingSettings.length > 0) {
        setResults(outcome);
        setSettingsQueue(pendingSettings);
        setSettingsIndex(0);
        setPhase('settings');
        onChanged?.();
        return;
      }

      setResults(outcome);
      setPhase('results');
      if (outcome.batch?.installed.length) {
        onChanged?.();
      }
    } catch (err) {
      const denial = resolveInstallDenial(err);
      const code = (err as { code?: string })?.code;
      if (code === 'ECONNABORTED' || code === 'ETIMEDOUT' || code === 'ERR_NETWORK') {
        setSelectedInstall(new Map());
        onChanged?.();
        setError(
          'The installation result is not confirmed. It may still complete. Check Installed Apps before starting another installation.',
        );
      } else if (denial) {
        setError(denial.message);
        setDenialAction(denial);
      } else {
        setError(
          (err as { message?: string })?.message || 'Failed to install apps.',
        );
      }
    } finally {
      setSubmitting(false);
    }
  }

  function handleSettingsComplete() {
    const nextIndex = settingsIndex + 1;
    if (nextIndex < settingsQueue.length) {
      setSettingsIndex(nextIndex);
      return;
    }
    setPhase('results');
    onChanged?.();
  }

  async function openSettingsForApp(app: App) {
    setSubmitting(true);
    setError(null);
    try {
      const pending = await resumeSettingsForApp(app);
      if (!pending) {
        setError('Could not resume install for this app.');
        return;
      }
      setSettingsQueue([pending]);
      setSettingsIndex(0);
      setPhase('settings');
    } finally {
      setSubmitting(false);
    }
  }

  const title =
    phase === 'settings'
      ? 'Finish app setup'
      : phase === 'results'
        ? 'App change results'
        : 'Manage apps';

  const closeDialog = () => {
    if (phase === 'results') {
      // Batch acceptance can race the list query's visible state — refresh
      // again when the user returns to the Apps page.
      onChanged?.();
    }
    onClose();
  };

  return (
    <>
      <Modal open={isOpen} onClose={closeDialog} title={title} width="max-w-dialog-wide">
        {phase === 'settings' && settingsQueue[settingsIndex] ? (
          <AppSettingsFinalizeStep
            pending={settingsQueue[settingsIndex]}
            onComplete={() => handleSettingsComplete()}
            onFinishLater={() => {
              setPhase(results ? 'results' : 'manage');
            }}
            onError={() => {}}
          />
        ) : phase === 'results' && results ? (
          <ResultsView results={results} onClose={closeDialog} />
        ) : (
          <>
            <Modal.Body>
              <div className="space-y-6" data-testid="app-manager-dialog">
                <Text variant="body-sm" tone="subtle">
                  Install available app packages. Uninstall installed apps from
                  each row — Apply only installs.
                </Text>

                {error && (
                  <div
                    role="alert"
                    data-testid="app-manager-error"
                    className="rounded-[var(--radius-card)] border border-[color:var(--danger-fg)]/30 bg-[color:var(--danger-fg)]/10 px-4 py-3 space-y-2"
                  >
                    <Text variant="body-sm" tone="danger">
                      {error}
                    </Text>
                    {denialAction?.actionLabel && denialAction.onAction ? (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={denialAction.onAction}
                        data-testid="app-manager-denial-action"
                      >
                        {denialAction.actionLabel}
                      </Button>
                    ) : null}
                  </div>
                )}

                {loading ? (
                  <div
                    className="flex items-center gap-2"
                    data-testid="app-manager-loading"
                  >
                    <Loader2
                      size={14}
                      strokeWidth={LINE_STROKE}
                      className="animate-spin"
                    />
                    <Text variant="body-sm" tone="muted">
                      Loading…
                    </Text>
                  </div>
                ) : (
                  <>
                    <section>
                      <Text
                        as="h3"
                        variant="meta"
                        weight="semibold"
                        className="mb-2 uppercase tracking-wide"
                      >
                        Installed
                      </Text>
                      {bundleApps.length === 0 ? (
                        <Surface
                          tone="panel-2"
                          border="subtle"
                          radius="card"
                          padding="md"
                        >
                          <Text variant="body-sm" tone="muted">
                            No bundle-backed apps in this workspace.
                          </Text>
                        </Surface>
                      ) : (
                        <ul className="space-y-2" data-testid="app-manager-installed">
                          {bundleApps.map(app => {
                            const pf = preflights.get(app.id);
                            const blockers = [
                              ...(pf?.blocking_dependents || []).map(
                                d => d.app_name || 'Untitled app',
                              ),
                              ...(pf?.blocking_references || []).map(
                                r => r.source_app_name || 'Untitled app',
                              ),
                            ];
                            const blocked =
                              (pf?.blocking_dependents?.length || 0) > 0 ||
                              (pf?.blocking_references?.length || 0) > 0;
                            return (
                              <InstalledRow
                                key={app.id}
                                app={app}
                                canUninstall={canUninstallApp(app, user)}
                                uninstallBlocked={blocked}
                                blockerNames={[...new Set(blockers)]}
                                onUninstall={() =>
                                  setUninstallTarget({
                                    appId: app.id,
                                    appName: app.name,
                                  })
                                }
                                onCompleteSetup={() => openSettingsForApp(app)}
                                disabled={submitting}
                              />
                            );
                          })}
                        </ul>
                      )}
                    </section>

                    <section>
                      <Text
                        as="h3"
                        variant="meta"
                        weight="semibold"
                        className="mb-2 uppercase tracking-wide"
                      >
                        Available
                      </Text>
                      {profiles.length === 0 ? (
                        <Surface
                          tone="panel-2"
                          border="subtle"
                          radius="card"
                          padding="md"
                        >
                          <Text variant="body-sm" tone="muted">
                            No app packages available.
                          </Text>
                        </Surface>
                      ) : (
                        <ul
                          className="space-y-2 max-h-[22rem] overflow-y-auto pr-1"
                          data-testid="app-manager-available"
                        >
                          {profiles.map(profile => {
                            const { name, description, slug } =
                              extractPackageMeta(profile);
                            const installed = isPackageInstalled(profile, apps);
                            const isSelected = selectedInstall.has(profile.id);
                            const row = selectedInstall.get(profile.id);
                            const summary = summarizeLibraryManifest(
                              profile.manifest,
                            );
                            return (
                              <li
                                key={profile.id}
                                data-testid={`app-manager-row-${slug || profile.id}`}
                              >
                                <AvailableRow
                                  name={name}
                                  description={description}
                                  slug={slug}
                                  installed={installed}
                                  isSelected={isSelected}
                                  summary={summary}
                                  row={row}
                                  disabled={installed || submitting}
                                  onToggle={() => toggleInstall(profile)}
                                  onUpdate={patch =>
                                    updateInstallRow(profile.id, patch)
                                  }
                                  canDelete={Boolean(profile.workspace_id)}
                                  deleting={deletingPackages.has(profile.id)}
                                  onDelete={() => void deleteTemplate(profile)}
                                />
                              </li>
                            );
                          })}
                        </ul>
                      )}
                    </section>

                    {selectedInstallCount > 0 && (
                      <Surface
                        tone="panel-2"
                        border="subtle"
                        radius="card"
                        padding="md"
                      >
                        <IncludeSeedDataToggle
                          checked={includeSeedData}
                          onChange={setIncludeSeedData}
                          seedEntryCount={selectedSeedEntryCount}
                          disabled={submitting}
                        />
                      </Surface>
                    )}
                  </>
                )}
              </div>
            </Modal.Body>

            <Modal.Footer align="between">
              <div className="flex items-center gap-3">
                <Button variant="ghost" onClick={onClose} disabled={submitting}>
                  Cancel
                </Button>
                {onCreateBlankApp ? (
                  <button
                    type="button"
                    className="text-sm text-[var(--link)] hover:underline disabled:opacity-50"
                    onClick={onCreateBlankApp}
                    disabled={submitting}
                    data-testid="app-manager-blank-app"
                  >
                    Create blank app…
                  </button>
                ) : null}
              </div>
              <Button
                variant="primary"
                icon={<Package size={14} strokeWidth={LINE_STROKE} />}
                onClick={applyChanges}
                loading={submitting}
                disabled={submitting || selectedInstallCount === 0}
                data-testid="app-manager-apply"
              >
                {applyLabel}
              </Button>
            </Modal.Footer>
          </>
        )}
      </Modal>

      {uninstallTarget ? (
        <AppUninstallModal
          open
          appId={uninstallTarget.appId}
          appName={uninstallTarget.appName}
          preflight={preflights.get(uninstallTarget.appId) ?? null}
          onClose={() => setUninstallTarget(null)}
          onUninstalled={() => {
            setUninstallTarget(null);
            onChanged?.();
          }}
        />
      ) : null}
    </>
  );
}

function canUninstallApp(app: App, user: { id: string; user_id?: string } | null): boolean {
  if (!user || !app.owner_user_id) return false;
  return isSamePrincipal(user, app.owner_user_id);
}

function InstalledRow({
  app,
  canUninstall,
  uninstallBlocked,
  blockerNames,
  onUninstall,
  onCompleteSetup,
  disabled,
}: {
  app: App;
  canUninstall: boolean;
  uninstallBlocked: boolean;
  blockerNames: string[];
  onUninstall: () => void;
  onCompleteSetup: () => void;
  disabled: boolean;
}) {
  const badge = lifecycleBadge(app.lifecycle_state);
  const needsSettings = app.lifecycle_state === 'awaiting_settings';
  const uninstallDisabled =
    disabled || !canUninstall || uninstallBlocked;
  const uninstallTitle = !canUninstall
    ? 'Only the App owner can uninstall'
    : uninstallBlocked
      ? `Uninstall ${blockerNames.join(', ') || 'dependent apps'} first`
      : undefined;

  return (
    <Surface tone="panel-2" border="subtle" radius="card">
      <div className="flex items-start gap-3 px-3 py-2.5">
        <AppIcon name={app.name} icon={app.icon} color={app.accent_color} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Text as="span" variant="body" weight="medium" truncate>
              {app.name}
            </Text>
            {badge ? (
              <StatusBadge
                label={badge}
                variant={needsSettings ? 'warning' : 'default'}
              />
            ) : null}
            {app.source_operational_model_slug ? (
              <Text as="span" variant="meta" tone="subtle" className="font-mono">
                {app.source_operational_model_slug}
              </Text>
            ) : null}
          </div>
          {app.description ? (
            <Text variant="meta" tone="subtle" className="mt-0.5 line-clamp-2">
              {app.description}
            </Text>
          ) : null}
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <Link
              to={`/apps/${app.id}`}
              className="inline-flex items-center gap-1 text-xs text-[var(--link)] hover:underline"
            >
              Open app
              <ExternalLink size={12} strokeWidth={LINE_STROKE} />
            </Link>
            {needsSettings ? (
              <button
                type="button"
                className="text-xs text-[var(--link)] hover:underline"
                onClick={onCompleteSetup}
                disabled={disabled}
              >
                Complete setup
              </button>
            ) : null}
            {canUninstall ? (
              <button
                type="button"
                className="text-xs text-[var(--danger-fg)] hover:underline disabled:opacity-50 disabled:no-underline disabled:cursor-not-allowed"
                onClick={onUninstall}
                disabled={uninstallDisabled}
                title={uninstallTitle}
                data-testid={`app-manager-uninstall-${app.id}`}
              >
                Uninstall
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </Surface>
  );
}

function AvailableRow({
  name,
  description,
  slug,
  installed,
  isSelected,
  summary,
  row,
  disabled,
  onToggle,
  onUpdate,
  canDelete,
  deleting,
  onDelete,
}: {
  name: string;
  description: string;
  slug: string;
  installed: boolean;
  isSelected: boolean;
  summary: ReturnType<typeof summarizeLibraryManifest>;
  row?: SelectedInstallRow;
  disabled: boolean;
  onToggle: () => void;
  onUpdate: (patch: Partial<SelectedInstallRow>) => void;
  canDelete: boolean;
  deleting: boolean;
  onDelete: () => void;
}) {
  const selectedShell = `
    rounded-[var(--radius-card)] border border-[var(--brand-accent-line)]
    bg-[var(--brand-accent-soft)]
  `;

  const header = (
    <div className="flex items-start gap-2">
    <button
      type="button"
      onClick={onToggle}
      disabled={disabled}
      className="min-w-0 flex-1 text-left flex items-start gap-3 px-3 py-2.5 disabled:cursor-not-allowed"
    >
      {/* The checkbox stopPropagation()s its own click (so row-level
          handlers can't double-fire) — wiring a no-op here made the
          checkbox itself dead while only the row text toggled. */}
      <Checkbox checked={isSelected} onChange={onToggle} disabled={disabled} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <Text as="span" variant="body" weight="medium" truncate>
            {name}
          </Text>
          {installed ? <StatusBadge label="Installed" variant="muted" /> : null}
          {slug ? (
            <Text as="span" variant="meta" tone="subtle" className="font-mono">
              {slug}
            </Text>
          ) : null}
        </div>
        {description ? (
          <Text variant="meta" tone="subtle" className="mt-0.5">
            {description}
          </Text>
        ) : null}
        <Text variant="meta" tone="subtle" className="mt-1">
          {summary.prescribedTrackCount} tracks · {summary.skillCount} skills ·{' '}
          {summary.agentCount} agents
        </Text>
      </div>
    </button>
    {canDelete ? (
      <button
        type="button"
        className="shrink-0 rounded-[var(--radius-control)] px-2 py-1 text-xs text-[var(--danger-fg)] hover:bg-[var(--danger-bg)] disabled:opacity-50"
        onClick={onDelete}
        disabled={deleting}
        aria-label={`Delete ${name} template`}
      >
        {deleting ? 'Deleting…' : 'Delete'}
      </button>
    ) : null}
    </div>
  );

  if (isSelected && row) {
    return (
      <div className={`${selectedShell} transition-colors duration-fast`}>
        {header}
        <div className="border-t border-[var(--panel-border)] px-3 py-3 space-y-2">
          <Input
            value={row.name}
            onChange={e => onUpdate({ name: e.target.value })}
            placeholder="App name"
            aria-label="App name override"
            size="sm"
          />
          <Textarea
            value={row.description}
            onChange={e => onUpdate({ description: e.target.value })}
            placeholder="Description"
            aria-label="App description override"
            rows={2}
            size="sm"
          />
        </div>
      </div>
    );
  }

  return (
    <Surface
      tone="panel-2"
      border="subtle"
      radius="card"
      className={installed ? 'opacity-60' : ''}
    >
      {header}
    </Surface>
  );
}

function Checkbox({
  checked,
  onChange,
  disabled,
}: {
  checked: boolean;
  onChange: () => void;
  disabled?: boolean;
}) {
  return (
    <span
      role="checkbox"
      aria-checked={checked}
      tabIndex={disabled ? -1 : 0}
      onClick={e => {
        e.stopPropagation();
        if (!disabled) onChange();
      }}
      onKeyDown={e => {
        if (disabled) return;
        if (e.key === ' ' || e.key === 'Enter') {
          e.preventDefault();
          onChange();
        }
      }}
      className={`
        mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center
        rounded-[3px] border-2 cursor-pointer
        ${checked
          ? 'border-[var(--brand-accent)] bg-[var(--brand-accent)]'
          : 'border-[var(--text-muted)]'
        }
        ${disabled ? 'opacity-50 cursor-not-allowed' : ''}
      `}
    >
      {checked ? (
        <Check size={10} strokeWidth={3} className="text-white" />
      ) : null}
    </span>
  );
}

function StatusBadge({
  label,
  variant,
}: {
  label: string;
  variant: 'default' | 'warning' | 'muted';
}) {
  const borderClass =
    variant === 'warning'
      ? 'border-amber-500/40'
      : 'border-[var(--panel-border)]';
  const textTone =
    variant === 'warning' ? 'warn' : variant === 'muted' ? 'subtle' : 'muted';

  return (
    <span
      className={`inline-flex items-center px-1.5 py-0.5 rounded-[var(--radius-pill)] border ${borderClass}`}
    >
      <Text
        variant="meta"
        tone={textTone}
        weight="medium"
        className="uppercase tracking-wide"
      >
        {label}
      </Text>
    </span>
  );
}

function ResultsView({
  results,
  onClose,
}: {
  results: ManagerResults;
  onClose: () => void;
}) {
  const batch = results.batch;
  return (
    <>
      <Modal.Body>
        <div className="space-y-4" data-testid="app-manager-result">
          {results.uninstalled.length > 0 && (
            <ResultSection title={`Uninstalled (${results.uninstalled.length})`}>
              {results.uninstalled.map(row => (
                <li key={row.app_id} className="flex items-center gap-2">
                  <Check size={14} className="text-[var(--brand-accent)]" />
                  <Text variant="body">{row.name}</Text>
                </li>
              ))}
            </ResultSection>
          )}

          {results.uninstallQueued.length > 0 && (
            <ResultSection title={`Uninstall queued (${results.uninstallQueued.length})`}>
              {results.uninstallQueued.map(row => (
                <li key={row.app_id} className="flex items-center gap-2">
                  <Check size={14} className="text-[var(--brand-accent)]" />
                  <Text variant="body">
                    {row.name} (will disappear when lifecycle work completes)
                  </Text>
                </li>
              ))}
            </ResultSection>
          )}

          {results.uninstallBlocked.length > 0 && (
            <ResultSection
              title={`Uninstall blocked (${results.uninstallBlocked.length})`}
              tone="danger"
            >
              {results.uninstallBlocked.map(row => (
                <li key={row.app_id}>
                  <Text variant="body" tone="danger">
                    {row.name} — uninstall dependents first
                  </Text>
                </li>
              ))}
            </ResultSection>
          )}

          {results.uninstallFailed.length > 0 && (
            <ResultSection
              title={`Uninstall failed (${results.uninstallFailed.length})`}
              tone="danger"
            >
              {results.uninstallFailed.map(row => (
                <li key={row.app_id}>
                  <Text variant="body" tone="danger">
                    {row.name} — {row.error}
                  </Text>
                </li>
              ))}
            </ResultSection>
          )}

          {batch ? (
            <>
              <Surface tone="panel-2" border="default" radius="card" padding="md">
                <Text variant="body">
                  <Text as="span" weight="semibold">
                    {batch.installed.length}
                  </Text>{' '}
                  installed,{' '}
                  <Text as="span" weight="semibold">
                    {batch.skipped.length}
                  </Text>{' '}
                  skipped,{' '}
                  <Text as="span" weight="semibold" tone="danger">
                    {batch.failed.length}
                  </Text>{' '}
                  failed
                </Text>
              </Surface>
              {batch.installed.length > 0 && (
                <ResultSection title={`Installed (${batch.installed.length})`}>
                  {batch.installed.map(row => (
                    <li key={row.library_cp_id} className="flex items-center gap-2">
                      <Check size={14} className="text-[var(--brand-accent)]" />
                      <Text variant="body">
                        {row.name || 'Untitled app'}
                        {row.status === 'awaiting_settings'
                          ? ' (needs settings)'
                          : ''}
                      </Text>
                    </li>
                  ))}
                </ResultSection>
              )}
              {batch.failed.length > 0 && (
                <ResultSection title={`Install failed (${batch.failed.length})`} tone="danger">
                  {batch.failed.map(row => {
                    const denial = resolveInstallDenial(row);
                    return (
                      <li key={row.library_cp_id} className="space-y-2">
                        <Text as="p" variant="body" tone="danger">
                          {row.name || 'Untitled app'} — {denial?.message || row.error}
                        </Text>
                        {denial?.actionLabel && denial.onAction ? (
                          <Button variant="outline" size="sm" onClick={denial.onAction}>
                            {denial.actionLabel}
                          </Button>
                        ) : null}
                        {row.error_code === 'app_dependency_error' ? (
                          <Text as="p" variant="body-sm" tone="muted">
                            Resolve the required app installation or update, then return to install this app.
                          </Text>
                        ) : null}
                      </li>
                    );
                  })}
                </ResultSection>
              )}
            </>
          ) : null}
        </div>
      </Modal.Body>
      <Modal.Footer>
        <Button variant="primary" onClick={onClose}>
          Close
        </Button>
      </Modal.Footer>
    </>
  );
}

function ResultSection({
  title,
  children,
  tone,
}: {
  title: string;
  children: ReactNode;
  tone?: 'danger';
}) {
  return (
    <details open>
      <summary className="cursor-pointer">
        <Text
          as="span"
          variant="meta"
          tone={tone === 'danger' ? 'danger' : 'muted'}
        >
          {title}
        </Text>
      </summary>
      <ul className="mt-2 space-y-1 pl-1">{children}</ul>
    </details>
  );
}
