import { useState, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  Package,
  PackagePlus,
  Layers,
  Tag,
  LayoutGrid,
  ArrowRight,
  Boxes,
  Bot,
  RefreshCw,
} from 'lucide-react';
import { operationalModelsApi } from '../api';
import type { OperationalModelNode } from '../types';
import {
  Button,
  EmptyState,
  IconWell,
  LINE_ICON_STROKE,
  PageHeading,
  PageMeta,
  PageShell,
  PageSection,
  filterBar,
  FilterActionRow,
  PageSearchInput,
  Skeleton,
} from '../components/ui';
import { useSetCrumbs } from '../context/CrumbsContext';
import { useScope } from '../context/ScopeContext';
import { ImportPackageModal } from '../components/library/ImportPackageModal';
import { usePublishPageContext } from '../hooks/usePublishPageContext';
import { usePlatformAdmin } from '../hooks/usePlatformAdmin';
import { useConfirm } from '../context/ConfirmContext';
import { useToast } from '../context/ToastContext';
import {
  manifestKindLabel,
  summarizeLibraryManifest,
} from '../lib/operationalModelManifest';

function scopeLabel(scope?: string): string {
  switch (scope) {
    case 'platform':
      return 'Platform';
    case 'organization':
      return 'Organization';
    case 'community':
      return 'Community';
    default:
      return 'Library';
  }
}

function scopeColor(scope?: string): string {
  switch (scope) {
    case 'platform':
      return 'bg-[var(--ai-bg)] text-[var(--ai-fg)] border-[color:var(--ai-fg)]/20';
    case 'organization':
      return 'bg-[var(--info-bg)] text-[var(--info-fg)] border-[color:var(--info-fg)]/20';
    case 'community':
      return 'bg-[var(--success-bg)] text-[var(--success-fg)] border-[color:var(--success-fg)]/20';
    default:
      return 'bg-[var(--panel-2)] text-[var(--text-muted)] border-[var(--panel-border)]';
  }
}

function OperationalModelCard({ cp }: { cp: OperationalModelNode }) {
  const manifest = cp.manifest as Record<string, unknown> | undefined;
  const summary = summarizeLibraryManifest(manifest);
  const entryTypeCount = summary.entryTypeCount;
  const tagCount = summary.tagCount;
  const viewCount = summary.viewCount;
  const skillCount = summary.skillCount;
  const agentCount = summary.agentCount;

  return (
    <Link
      to={`/models/${cp.id}`}
      className="group block app-card p-5 hover:border-[var(--text-muted)]/25 transition-colors"
    >
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-8 h-8 rounded-lg bg-[var(--panel-2)] flex items-center justify-center shrink-0">
            <Package size={16} strokeWidth={LINE_ICON_STROKE} className="text-[var(--text-muted)]" />
          </div>
          <h3 className="text-sm font-semibold text-[var(--text)] truncate group-hover:text-[var(--link)] transition-colors">
            {cp.name}
          </h3>
        </div>
        <div className="flex flex-col items-end gap-1 shrink-0">
          <span
            className={`text-[12px] px-2 py-0.5 rounded-full border font-medium ${scopeColor(cp.scope)}`}
          >
            {scopeLabel(cp.scope)}
          </span>
          <span className="text-[12px] text-[var(--text-muted)] font-medium">
            {manifestKindLabel(summary.scopeKind)}
          </span>
        </div>
      </div>

      {cp.description && (
        <p className="text-xs text-[var(--text-muted)] line-clamp-2 mb-3">
          {cp.description}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-[var(--text-muted)]">
        {entryTypeCount > 0 && (
          <span className="flex items-center gap-1 whitespace-nowrap">
            <Layers size={12} />
            {entryTypeCount} {entryTypeCount === 1 ? 'type' : 'types'}
          </span>
        )}
        {tagCount > 0 && (
          <span className="flex items-center gap-1 whitespace-nowrap">
            <Tag size={12} />
            {tagCount} {tagCount === 1 ? 'tag' : 'tags'}
          </span>
        )}
        {viewCount > 0 && (
          <span className="flex items-center gap-1 whitespace-nowrap">
            <LayoutGrid size={12} />
            {viewCount} {viewCount === 1 ? 'view' : 'views'}
          </span>
        )}
        {summary.prescribedTrackCount > 0 && (
          <span className="flex items-center gap-1 whitespace-nowrap">
            <Boxes size={12} />
            {summary.prescribedTrackCount} {summary.prescribedTrackCount === 1 ? 'track' : 'tracks'}
          </span>
        )}
        {skillCount > 0 && (
          <span className="flex items-center gap-1 whitespace-nowrap">
            <Bot size={12} />
            {skillCount} {skillCount === 1 ? 'skill' : 'skills'}
          </span>
        )}
        {agentCount > 0 && (
          <span className="flex items-center gap-1 whitespace-nowrap">
            <Bot size={12} />
            {agentCount} {agentCount === 1 ? 'agent' : 'agents'}
          </span>
        )}
      </div>

      <div className="mt-3 flex items-center justify-between">
        {cp.version && (
          <span className="text-[12px] text-[var(--text-muted)] font-mono">
            v{cp.version}
          </span>
        )}
        <span className="text-xs text-[var(--link)] group-hover:translate-x-0.5 transition-transform flex items-center gap-1">
          View details <ArrowRight size={12} />
        </span>
      </div>
    </Link>
  );
}

export function OperationalModelsPage() {
  useSetCrumbs([{ label: 'Operational Models' }]);
  const [search, setSearch] = useState('');
  const [scopeFilter, setScopeFilter] = useState<string>('');
  const [importOpen, setImportOpen] = useState(false);
  const { scope } = useScope();
  const queryClient = useQueryClient();
  const isPlatformAdmin = usePlatformAdmin();
  const confirm = useConfirm();
  const { showToast } = useToast();
  const [rescanning, setRescanning] = useState(false);

  const { data: profiles, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['operational-models'],
    queryFn: operationalModelsApi.list,
  });

  usePublishPageContext({
    pageKind: 'operational_models_list',
    metadata: {
      profile_count: profiles?.length ?? 0,
      profile_names: (profiles ?? [])
        .map((pr) => pr.name)
        .filter(Boolean)
        .slice(0, 25),
    },
  });

  const filtered = useMemo(() => {
    if (!profiles) return [];
    return profiles.filter(cp => {
      if (scopeFilter && cp.scope !== scopeFilter) return false;
      if (search) {
        const q = search.toLowerCase();
        const nameMatch = (cp.name || '').toLowerCase().includes(q);
        const descMatch = (cp.description || '').toLowerCase().includes(q);
        const pkg = cp.manifest?.package as Record<string, unknown> | undefined;
        const pkgName =
          typeof pkg?.name === 'string' ? pkg.name.toLowerCase() : '';
        const pkgDesc =
          typeof pkg?.description === 'string' ? pkg.description.toLowerCase() : '';
        const pkgMatch = pkgName.includes(q) || pkgDesc.includes(q);
        if (!nameMatch && !descMatch && !pkgMatch) return false;
      }
      return true;
    });
  }, [profiles, search, scopeFilter]);

  const scopes = useMemo(() => {
    if (!profiles) return [];
    return [...new Set(profiles.map(p => p.scope || 'library'))];
  }, [profiles]);

  const rescanPackages = async () => {
    const ok = await confirm({
      title: 'Rescan package catalog?',
      message: 'Re-read package bundles available to this Core instance and refresh their catalog fingerprints. This can add, update, or reconcile catalog entries; installed Apps change only when separately updated from their package.',
      confirmLabel: 'Rescan packages',
      variant: 'default',
    });
    if (!ok) return;
    setRescanning(true);
    try {
      const result = await operationalModelsApi.rescanPackages();
      await queryClient.invalidateQueries({ queryKey: ['operational-models'] });
      const changes = result.added.length + result.updated.length + result.removed.length;
      showToast(
        result.issues.length
          ? `Package rescan found ${result.issues.length} issue(s)`
          : `Package catalog refreshed (${changes} package change${changes === 1 ? '' : 's'})`,
        result.issues.length ? 'error' : 'success',
      );
    } catch (e: unknown) {
      showToast((e as Error)?.message || 'Package rescan failed', 'error');
    } finally {
      setRescanning(false);
    }
  };

  if (isError) {
    return (
      <div className="w-full px-4 md:px-6 py-6 md:py-8">
        <div className="app-card p-8 text-center">
          <h2 className="text-sm font-semibold text-[var(--text)] mb-2">
            Could not load the library
          </h2>
          <p className="text-xs text-[var(--text-muted)] mb-4">
            {(error as Error)?.message || 'Request failed. Try again when you are signed in.'}
          </p>
          <button
            type="button"
            onClick={() => refetch()}
            className="text-sm text-[var(--link)] hover:underline"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="w-full px-4 md:px-6 py-6 md:py-8">
        <div className="mb-6 space-y-2">
          <Skeleton className="h-9 w-64 rounded-md" />
          <Skeleton className="h-4 w-full max-w-xl rounded-md" />
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3, 4, 5, 6].map(i => (
            <Skeleton key={i} className="h-28 rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  const profileCount = profiles?.length ?? 0;

  return (
    <PageShell>
      <PageSection>
      <header className="mb-8 md:mb-10">
        <div className="flex items-start justify-between gap-4">
          <PageHeading>Operational Models</PageHeading>
          {scope?.workspaceId && (
            <Button
              type="button"
              variant="primary"
              size="sm"
              icon={<PackagePlus size={14} strokeWidth={LINE_ICON_STROKE} />}
              onClick={() => setImportOpen(true)}
              className="shrink-0 mt-1"
            >
              Import model
            </Button>
          )}
          {isPlatformAdmin && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              icon={<RefreshCw size={14} strokeWidth={LINE_ICON_STROKE} />}
              onClick={rescanPackages}
              disabled={rescanning}
              className="shrink-0 mt-1"
            >
              {rescanning ? 'Refreshing…' : 'Refresh'}
            </Button>
          )}
        </div>
        <PageMeta>
          <span>{profileCount} {profileCount === 1 ? 'model' : 'models'}</span>
          <span aria-hidden>·</span>
          <span>Each model defines records, views, and operational guidance</span>
        </PageMeta>
      </header>
      </PageSection>

      <PageSection.Separator />

      <PageSection className={filterBar.sectionTop}>
      {/* Search left, scope filters right — accessorial controls sit to the
          right of the search field (app-wide rule). */}
      <FilterActionRow>
        <div className="relative w-full max-w-xl">
          <PageSearchInput
            value={search}
            onChange={setSearch}
            placeholder="Search models…"
          />
        </div>
        {scopes.length > 1 && (
          <div className="flex gap-1 shrink-0">
            <button
              type="button"
              onClick={() => setScopeFilter('')}
              className={`text-xs px-3 py-2 rounded-lg border transition-colors ${
                !scopeFilter
                  ? 'bg-[var(--nav-active-bg)] text-[var(--nav-active-fg)] border-[var(--panel-border)]'
                  : 'border-transparent text-[var(--text-muted)] hover:bg-[var(--panel-2)]'
              }`}
            >
              All
            </button>
            {scopes.map(scope => (
              <button
                key={scope}
                type="button"
                onClick={() => setScopeFilter(scope)}
                className={`text-xs px-3 py-2 rounded-lg border transition-colors ${
                  scopeFilter === scope
                    ? 'bg-[var(--nav-active-bg)] text-[var(--nav-active-fg)] border-[var(--panel-border)]'
                    : 'border-transparent text-[var(--text-muted)] hover:bg-[var(--panel-2)]'
                }`}
              >
                {scopeLabel(scope)}
              </button>
            ))}
          </div>
        )}
      </FilterActionRow>

      {filtered.length === 0 ? (
        <EmptyState
          icon={
            <IconWell size="lg" aria-hidden>
              <Package size={22} strokeWidth={LINE_ICON_STROKE} />
            </IconWell>
          }
          title={
            search || scopeFilter ? 'No matching models' : 'No models available'
          }
          description={
            search || scopeFilter
              ? 'Try adjusting your search or filters.'
              : 'Operational Models and App Packages will appear here when available.'
          }
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map(cp => (
            <OperationalModelCard key={cp.id} cp={cp} />
          ))}
        </div>
      )}
      </PageSection>

      {scope?.workspaceId && (
        <ImportPackageModal
          open={importOpen}
          onClose={() => setImportOpen(false)}
          onSuccess={() => {
            queryClient.invalidateQueries({ queryKey: ['operational-models'] });
            setImportOpen(false);
          }}
          workspaceId={scope.workspaceId}
        />
      )}
    </PageShell>
  );
}
