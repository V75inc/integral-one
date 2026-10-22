/**
 * App Manager — install / uninstall library app bundles in one dialog.
 */
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Check, ExternalLink } from 'lucide-react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui';
import { AppIcon, Surface, Text } from '../../ui';
import { AppManagerLibrary, type SelectedInstallRow } from './AppManagerLibrary';
import { countManifestSeedEntries } from '../../utils/manifestSeeds';
import {
  appsApi,
  type BatchInstallResponse,
  type UninstallPreflightResponse,
} from '../../api/apps';
import { operationalModelsApi } from '../../api/operationalModels';
import type { App, OperationalModelNode } from '../../types';
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
import { ImportPackageModal } from '../library/ImportPackageModal';
import { usePlatformAdmin } from '../../hooks/usePlatformAdmin';
import { useToast } from '../../context/ToastContext';
import { isSamePrincipal } from '../../utils';
import {
  resolveInstallDenial,
  type InstallDenialAction,
} from '../../host/registry';

const LINE_STROKE = 1.5;


export interface AppManagerDialogProps {
  initialDetailId?: string;
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
  initialDetailId,
  onClose,
  apps,
  onChanged,
  onCreateBlankApp,
}: AppManagerDialogProps) {
  const { user } = useAuth();
  const isPlatformAdmin = usePlatformAdmin();
  const [importOpen, setImportOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const { scope, workspaces } = useScope();
  const workspaceId = scope?.workspaceId;
  const workspaceName = workspaces?.find(workspace => workspace.id === workspaceId)?.name || 'this workspace';
  const [libraryRevision, setLibraryRevision] = useState(0);
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
    setProfiles([]);
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
  }, [isOpen, workspaceId, libraryRevision]);

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
    if (submitting) return;
    if (phase === 'results') {
      // Batch acceptance can race the list query's visible state — refresh
      // again when the user returns to the Apps page.
      onChanged?.();
    }
    setImportOpen(false);
    onClose();
  };

  const refreshLibrary = async () => {
    if (!await confirm({
      title: 'Refresh App library?',
      message: 'Re-read available package bundles. Installed Apps change only when separately updated.',
      confirmLabel: 'Refresh', variant: 'default',
    })) return;
    setRefreshing(true);
    try {
      const result = await operationalModelsApi.rescanPackages();
      setLibraryRevision(value => value + 1);
      toast.showToast(result.issues.length ? `Refresh found ${result.issues.length} issue(s)` : 'App library refreshed', result.issues.length ? 'error' : 'success');
    } catch {
      toast.showToast('Could not refresh App library', 'error');
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <>
      <Modal open={isOpen} onClose={closeDialog} title={title} width="max-w-dialog-wide" tall={phase === 'manage'}>
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
          <AppManagerLibrary key={workspaceId}
            initialDetailId={initialDetailId}
            libraryActions={<div className="flex flex-wrap gap-2 py-3">
              {workspaceId && <Button variant="outline" size="sm" disabled={submitting} onClick={() => setImportOpen(true)}>Import package</Button>}
              {isPlatformAdmin && <Button variant="ghost" size="sm" disabled={submitting || refreshing} onClick={() => void refreshLibrary()}> {refreshing ? 'Refreshing…' : 'Refresh library'}</Button>}
            </div>}
            profiles={profiles} apps={apps} installedApps={bundleApps}
            selected={selectedInstall} loading={loading} submitting={submitting}
            workspaceName={workspaceName} includeSeedData={includeSeedData}
            seedEntryCount={selectedSeedEntryCount} onSeedDataChange={setIncludeSeedData}
            onToggle={toggleInstall} onUpdate={updateInstallRow}
            onDelete={profile => void deleteTemplate(profile)} deletingPackages={deletingPackages}
            onInstall={() => void applyChanges()} onClose={closeDialog}
            onRetry={() => setLibraryRevision(revision => revision + 1)}
            onCreateBlankApp={onCreateBlankApp}
            error={error ? <div role="alert" data-testid="app-manager-error" className="space-y-2">
              <Text variant="body-sm" tone="danger">{error}</Text>
              {denialAction?.actionLabel && denialAction.onAction && <Button variant="outline" size="sm" onClick={denialAction.onAction} data-testid="app-manager-denial-action">{denialAction.actionLabel}</Button>}
            </div> : null}
            renderInstalled={app => {
              const pf = preflights.get(app.id);
              const blockers = [
                ...(pf?.blocking_dependents || []).map(d => d.app_name || 'Untitled app'),
                ...(pf?.blocking_references || []).map(r => r.source_app_name || 'Untitled app'),
              ];
              return <InstalledRow app={app} canUninstall={canUninstallApp(app, user)}
                uninstallBlocked={Boolean(pf?.blocking_dependents?.length || pf?.blocking_references?.length)}
                blockerNames={[...new Set(blockers)]}
                onUninstall={() => setUninstallTarget({ appId: app.id, appName: app.name })}
                onCompleteSetup={() => void openSettingsForApp(app)} disabled={submitting} />;
            }}
          />
        )}
      </Modal>
      {workspaceId && <ImportPackageModal key={workspaceId} open={isOpen && importOpen} workspaceId={workspaceId} onClose={() => setImportOpen(false)} onSuccess={() => { setImportOpen(false); setLibraryRevision(value => value + 1); }} />}

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
                label={needsSettings ? 'Setup needed' : badge}
                variant={needsSettings ? 'warning' : 'default'}
              />
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
              className="inline-flex min-h-11 items-center gap-1 hover:underline"
            >
              <Text variant="body-sm">Open App</Text>
              <ExternalLink size={12} strokeWidth={LINE_STROKE} />
            </Link>
            {needsSettings ? (
              <Button variant="outline" className="min-h-11" onClick={onCompleteSetup} disabled={disabled}>Finish setup</Button>
            ) : null}
            {canUninstall ? (
              <Button variant="ghost" className="min-h-11"
                onClick={onUninstall}
                disabled={uninstallDisabled}
                title={uninstallTitle}
                data-testid={`app-manager-uninstall-${app.id}`}
              >
                <Text variant="body-sm" tone="danger">Uninstall</Text>
              </Button>
            ) : null}
          </div>
        </div>
      </div>
    </Surface>
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
