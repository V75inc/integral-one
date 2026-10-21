import { PageMeta } from '../components/ui';
import { useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowLeft,
  Package,
  Layers,
  Tag,
  LayoutGrid,
  GitMerge,
  Check,
  Loader2,
  ChevronDown,
  Bot,
  Wrench,
} from 'lucide-react';
import { operationalModelsApi, tracksApi, appsApi } from '../api';
import { Button, Skeleton, LINE_ICON_STROKE } from '../components/ui';
import { useToast } from '../context/ToastContext';
import { useConfirm } from '../context/ConfirmContext';
import { useSetCrumbs } from '../context/CrumbsContext';
import {
  buildManifestInspection,
  manifestKindLabel,
  type InspectTrackSection,
} from '../lib/operationalModelManifest';
import { lucideFromOperationalModelIcon } from '../lib/manifestLucideIcon';
import { Text } from '../ui';
import { errorMessageFromAxios } from '../api/helpers';
import { useQueryClient } from '@tanstack/react-query';
import { usePublishPageContext } from '../hooks/usePublishPageContext';

function SectionBlock({ section }: { section: InspectTrackSection }) {
  const [openEt, setOpenEt] = useState<string | null>(null);

  return (
    <div className="app-card overflow-hidden mb-6">
      <div className="border-b border-[var(--panel-border)] px-4 py-3 bg-[var(--panel-2)]/40">
        <h2 className="text-sm font-semibold text-[var(--text)]">{section.name}</h2>
        {section.key && (
          <p className="text-[12px] font-mono text-[var(--text-muted)] mt-0.5">{section.key}</p>
        )}
        {section.description && (
          <p className="text-xs text-[var(--text-muted)] mt-2 leading-relaxed">{section.description}</p>
        )}
      </div>

      <div className="p-4 grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div>
          <div className="flex items-center gap-2 mb-3">
            <Layers size={14} strokeWidth={LINE_ICON_STROKE} className="text-[var(--text-muted)]" />
            <h3 className="text-xs uppercase tracking-[0.14em] text-[var(--text-muted)] font-semibold">
              Entry types
            </h3>
            <span className="ml-auto text-xs bg-[var(--panel-2)] text-[var(--text)] px-2 py-0.5 rounded-full">
              {section.entryTypes.length}
            </span>
          </div>
          {section.entryTypes.length === 0 ? (
            <p className="text-xs text-[var(--text-muted)]">None</p>
          ) : (
            <ul className="space-y-2">
              {section.entryTypes.map((et, i) => {
                const k = `${et.key ?? et.name}-${i}`;
                const expanded = openEt === k;
                const TypeIcon = lucideFromOperationalModelIcon(et.icon);
                return (
                  <li key={k} className="rounded-lg border border-[var(--panel-border)] bg-[var(--panel)]">
                    <button
                      type="button"
                      onClick={() => setOpenEt(expanded ? null : k)}
                      className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-[var(--text)] hover:bg-[var(--panel-2)]/60 transition-colors"
                    >
                      <ChevronDown
                        size={14}
                        className={`shrink-0 text-[var(--text-muted)] transition-transform ${expanded ? 'rotate-180' : ''}`}
                      />
                      <TypeIcon
                        size={16}
                        strokeWidth={LINE_ICON_STROKE}
                        className="shrink-0 text-[var(--text-muted)]"
                        aria-hidden
                      />
                      <span className="min-w-0 flex-1 font-medium capitalize">{et.name}</span>
                      <span className="text-[12px] text-[var(--text-muted)] shrink-0">
                        {et.fields.length} {et.fields.length === 1 ? 'field' : 'fields'}
                      </span>
                    </button>
                    {expanded && et.fields.length > 0 && (
                      <ul className="px-3 pb-2 pt-0 space-y-1 border-t border-[var(--panel-border)] mt-0">
                        {et.fields.map((f, fi) => (
                          <li
                            key={`${f.key}-${fi}`}
                            className="flex flex-wrap items-baseline gap-x-2 gap-y-0 text-xs pl-6 py-1"
                          >
                            <span className="text-[var(--text)]">{f.name}</span>
                            <span className="font-mono text-[12px] text-[var(--text-muted)]">{f.key}</span>
                            <span className="text-[var(--text-muted)]">({f.type})</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div>
          <div className="flex items-center gap-2 mb-3">
            <Tag size={14} strokeWidth={LINE_ICON_STROKE} className="text-[var(--text-muted)]" />
            <h3 className="text-xs uppercase tracking-[0.14em] text-[var(--text-muted)] font-semibold">
              Taxonomy tags
            </h3>
            <span className="ml-auto text-xs bg-[var(--panel-2)] text-[var(--text)] px-2 py-0.5 rounded-full">
              {section.tags.length}
            </span>
          </div>
          {section.tags.length === 0 ? (
            <p className="text-xs text-[var(--text-muted)]">None</p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {section.tags.map((tag, i) => (
                <span
                  key={`${tag.name}-${i}`}
                  className="text-xs px-2 py-0.5 rounded-full max-w-full break-words"
                  style={{
                    backgroundColor: tag.color ? `${tag.color}40` : 'var(--badge-muted-bg)',
                    color: tag.color || 'var(--badge-muted-fg)',
                  }}
                  title={tag.groupName ? `Group: ${tag.groupName}` : undefined}
                >
                  {tag.groupName ? `${tag.groupName}: ` : ''}
                  {tag.name}
                </span>
              ))}
            </div>
          )}
        </div>

        <div>
          <div className="flex items-center gap-2 mb-3">
            <LayoutGrid size={14} strokeWidth={LINE_ICON_STROKE} className="text-[var(--text-muted)]" />
            <h3 className="text-xs uppercase tracking-[0.14em] text-[var(--text-muted)] font-semibold">
              Views
            </h3>
            <span className="ml-auto text-xs bg-[var(--panel-2)] text-[var(--text)] px-2 py-0.5 rounded-full">
              {section.views.length}
            </span>
          </div>
          {section.views.length === 0 ? (
            <p className="text-xs text-[var(--text-muted)]">None</p>
          ) : (
            <ul className="space-y-1.5">
              {section.views.map((v, i) => (
                <li key={`${v.key ?? v.name}-${i}`} className="text-sm text-[var(--text)]">
                  {v.name}
                  <span className="text-[var(--text-muted)] text-xs ml-1">
                    ({v.viewType})
                    {v.isDefault ? ' · default' : ''}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

function OperationalModelDetailPage() {
  const { id } = useParams<{ id: string }>();

  usePublishPageContext(
    id ? { pageKind: 'operational_model_detail', metadata: { operational_model_id: id } } : null,
  );
  const navigate = useNavigate();
  const { showToast } = useToast();
  const confirm = useConfirm();
  const [selectedTrackId, setSelectedTrackId] = useState('');
  const [selectedAppId, setSelectedAppId] = useState('');
  const [merging, setMerging] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const queryClient = useQueryClient();

  const {
    data: profile,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: ['operational-model', id],
    enabled: Boolean(id),
    queryFn: () => operationalModelsApi.get(id!),
  });

  const { data: tracks = [] } = useQuery({
    queryKey: ['tracks', 'for-library-merge'],
    queryFn: () => tracksApi.list(),
    enabled: Boolean(profile),
    staleTime: 60_000,
  });

  const { data: apps = [] } = useQuery({
    queryKey: ['apps', 'for-library-merge'],
    queryFn: () => appsApi.list(),
    enabled: Boolean(profile),
    staleTime: 60_000,
  });

  const manifest = profile?.manifest as Record<string, unknown> | undefined;
  const inspection = buildManifestInspection(manifest);
  const isAppPackage = inspection.scopeKind === 'app';

  useSetCrumbs(
    profile
      ? [
          { label: 'Operational Models', to: '/models' },
          { label: profile.name?.trim() || 'Untitled operational model' },
        ]
      : [{ label: 'Operational Models', to: '/models' }, { label: 'Loading…' }]
  );

  const handleDelete = async () => {
    if (!id || !profile?.can_delete || deleting) return;
    if (!await confirm({
      title: 'Delete library model',
      message: `Delete “${profile.name}” from the reusable library? Existing Tracks keep their own configuration and records. New Tracks will no longer offer this model.`,
      confirmLabel: 'Delete model', variant: 'danger',
    })) return;
    setDeleting(true);
    try {
      await operationalModelsApi.delete(id);
      await queryClient.invalidateQueries({ queryKey: ['operational-models'] });
      showToast('Library model deleted', 'success');
      navigate('/models');
    } catch (error) {
      showToast(errorMessageFromAxios(error, 'Could not delete this library model.'), 'error');
    } finally { setDeleting(false); }
  };

  const handleMergeTrack = async () => {
    if (!selectedTrackId || !id) return;
    const ok = await confirm({
      title: 'Apply operational model',
      message: `Merge "${profile?.name}" into this track? Entry types, tags, and views from the package will be applied to the track operational model.`,
      confirmLabel: 'Merge',
      variant: 'default',
    });
    if (!ok) return;

    setMerging(true);
    try {
      await tracksApi.mergeLibraryIntoTrack(selectedTrackId, id);
      showToast('Operational Model applied to track', 'success');
      navigate(`/tracks/${selectedTrackId}`);
    } catch (e: unknown) {
      showToast(
        (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail ||
          'Merge failed',
        'error'
      );
    } finally {
      setMerging(false);
    }
  };

  const handleMergeApp = async () => {
    if (!selectedAppId || !id) return;
    const ok = await confirm({
      title: 'Apply package to app',
      message: `Merge "${profile?.name}" into this App? Prescribed tracks, entry types, views, and relations will be added to the App operational model, and matching tracks may be created.`,
      confirmLabel: 'Apply to app',
      variant: 'default',
    });
    if (!ok) return;

    setMerging(true);
    try {
      await appsApi.mergeLibraryIntoApp(selectedAppId, id);
      showToast('Library merged into app', 'success');
      navigate(`/apps/${selectedAppId}`);
    } catch (e: unknown) {
      showToast(
        (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail ||
          'Merge failed',
        'error'
      );
    } finally {
      setMerging(false);
    }
  };

  if (isLoading) {
    return (
      <div className="max-w-4xl mx-auto px-4 md:px-6 py-7">
        <Skeleton className="h-8 w-48 mb-2" />
        <Skeleton className="h-4 w-72 mb-6" />
        <Skeleton className="h-32 w-full rounded-lg" />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="max-w-4xl mx-auto px-4 md:px-6 py-12 text-center">
        <p className="text-[var(--text-muted)]">
          {(error as Error)?.message || 'Could not load this Operational Model.'}
        </p>
        <button
          type="button"
          onClick={() => refetch()}
          className="text-[var(--link)] text-sm mt-3 hover:underline"
        >
          Retry
        </button>
        <Link
          to="/models"
          className="block text-[var(--link)] text-sm mt-2 hover:underline"
        >
          ← Back to Library
        </Link>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="max-w-4xl mx-auto px-4 md:px-6 py-12 text-center">
        <p className="text-[var(--text-muted)]">Operational Model not found.</p>
        <Link to="/models" className="text-[var(--link)] text-sm mt-2 inline-block hover:underline">
          ← Back to Library
        </Link>
      </div>
    );
  }

  const extraBlurb =
    inspection.packageDescription &&
    inspection.packageDescription !== profile.description
      ? inspection.packageDescription
      : null;

  return (
    <div className="max-w-4xl mx-auto px-4 md:px-6 py-7">
      <Link
        to="/models"
        className="inline-flex items-center gap-1 text-sm text-[var(--text-muted)] hover:text-[var(--text)] mb-6"
      >
        <ArrowLeft size={14} /> Back to Library
      </Link>

      <div className="flex items-start gap-3 mb-6">
        <div className="w-10 h-10 rounded-lg bg-[var(--panel-2)] flex items-center justify-center shrink-0">
          <Package size={20} strokeWidth={LINE_ICON_STROKE} className="text-[var(--text-muted)]" />
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-display font-extrabold tracking-tight text-[var(--text)]">
            {profile.name}
          </h1>
          {profile.description && (
            <PageMeta as="p">{profile.description}</PageMeta>
          )}
          {extraBlurb && (
            <PageMeta as="p" className="border-l-2 border-[var(--panel-border)] pl-3">
              {extraBlurb}
            </PageMeta>
          )}
          <PageMeta>
            {profile.version && <span className="font-mono">v{profile.version}</span>}
            {profile.scope && (
              <span className="rounded-md border border-[var(--panel-border)] px-2 py-0.5 capitalize">
                {profile.scope}
              </span>
            )}
            <span className="rounded-md border border-[var(--panel-border)] px-2 py-0.5">
              {manifestKindLabel(inspection.scopeKind)}
            </span>
          </PageMeta>
        </div>
        {profile.can_delete && <Button variant="outline" disabled={deleting} onClick={handleDelete}>Delete model</Button>}
      </div>

      {inspection.sections.length === 0 ? (
        <div className="app-card p-6 mb-8">
          <Text variant="body" tone="muted" as="p">
            This package has no inspectable manifest sections. It may use an older or empty format.
          </Text>
        </div>
      ) : (
        <div className="mb-8">
          {inspection.sections.map((section, idx) => (
            <SectionBlock key={`${section.key ?? section.name}-${idx}`} section={section} />
          ))}
        </div>
      )}

      {(inspection.operational.skills.length > 0 ||
        inspection.operational.agents.length > 0 ||
        inspection.operational.tools.length > 0 ||
        inspection.operational.hookCount > 0) && (
        <div className="app-card overflow-hidden mb-8">
          <div className="border-b border-[var(--panel-border)] px-4 py-3 bg-[var(--panel-2)]/40">
            <h2 className="text-sm font-semibold text-[var(--text)]">Operational layer</h2>
            <p className="text-xs text-[var(--text-muted)] mt-1">
              Skills, agents, and bundle tools declared for runtime after install.
            </p>
          </div>
          <div className="p-4 grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
            <div>
              <div className="flex items-center gap-2 mb-2 text-xs uppercase tracking-[0.14em] text-[var(--text-muted)] font-semibold">
                <Bot size={14} /> Skills ({inspection.operational.skills.length})
              </div>
              <ul className="space-y-1 font-mono text-xs">
                {inspection.operational.skills.map(s => (
                  <li key={s.key}>
                    {s.key}{' '}
                    <span className="text-[var(--text-muted)]">({s.kind})</span>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <div className="flex items-center gap-2 mb-2 text-xs uppercase tracking-[0.14em] text-[var(--text-muted)] font-semibold">
                <Bot size={14} /> Agents ({inspection.operational.agents.length})
              </div>
              <ul className="space-y-1 text-xs">
                {inspection.operational.agents.map(a => (
                  <li key={a.key}>
                    <span className="font-medium">{a.name}</span>{' '}
                    <span className="font-mono text-[var(--text-muted)]">({a.key})</span>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <div className="flex items-center gap-2 mb-2 text-xs uppercase tracking-[0.14em] text-[var(--text-muted)] font-semibold">
                <Wrench size={14} /> Tools & hooks
              </div>
              {inspection.operational.tools.length === 0 &&
              inspection.operational.hookCount === 0 ? (
                <p className="text-xs text-[var(--text-muted)]">None</p>
              ) : (
                <>
                  <ul className="space-y-1 font-mono text-xs mb-2">
                    {inspection.operational.tools.map(t => (
                      <li key={t}>{t}</li>
                    ))}
                  </ul>
                  {inspection.operational.hookCount > 0 && (
                    <p className="text-xs text-[var(--text-muted)]">
                      {inspection.operational.hookCount} hook
                      {inspection.operational.hookCount === 1 ? '' : 's'} wired
                    </p>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="app-card p-5">
        <h3 className="text-sm font-semibold text-[var(--text)] mb-1 flex items-center gap-2">
          <GitMerge size={16} strokeWidth={LINE_ICON_STROKE} />
          {isAppPackage ? 'Apply to an App' : 'Apply to a Track'}
        </h3>
        <p className="text-xs text-[var(--text-muted)] mb-4">
          {isAppPackage ? (
            <>
              App Packages apply their App Model and can provision the
              prescribed tracks defined in the manifest. Use this for suites like CRM + PM.
            </>
          ) : (
            <>
              Apply this Track Model to one track. Entry types, taxonomy tags,
              and views are added to that track.
            </>
          )}
        </p>

        {isAppPackage ? (
          apps.length === 0 ? (
            <p className="text-xs text-[var(--text-muted)]">
              You don&apos;t have any apps yet.{' '}
              <Link to="/apps" className="text-[var(--link)] hover:underline">
                Create an App first
              </Link>
            </p>
          ) : (
            <div className="flex flex-col sm:flex-row gap-3">
              <select
                value={selectedAppId}
                onChange={e => setSelectedAppId(e.target.value)}
                className="flex-1 text-sm rounded-lg border border-[var(--panel-border)] bg-[var(--panel)] text-[var(--text)] px-3 py-2 focus:outline-none focus:border-[var(--link)]"
              >
                <option value="">Select an App...</option>
                {apps.map(s => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
              <button
                type="button"
                disabled={!selectedAppId || merging}
                onClick={handleMergeApp}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white bg-[var(--link)] hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {merging ? (
                  <>
                    <Loader2 size={14} className="animate-spin" />
                    Applying...
                  </>
                ) : (
                  <>
                    <Check size={14} />
                    Apply to app
                  </>
                )}
              </button>
            </div>
          )
        ) : tracks.length === 0 ? (
          <p className="text-xs text-[var(--text-muted)]">
            You don&apos;t have any tracks yet.{' '}
            <Link to="/tracks" className="text-[var(--link)] hover:underline">
              Create one first
            </Link>
          </p>
        ) : (
          <div className="flex flex-col sm:flex-row gap-3">
            <select
              value={selectedTrackId}
              onChange={e => setSelectedTrackId(e.target.value)}
              className="flex-1 text-sm rounded-lg border border-[var(--panel-border)] bg-[var(--panel)] text-[var(--text)] px-3 py-2 focus:outline-none focus:border-[var(--link)]"
            >
              <option value="">Select a track...</option>
              {tracks.map(t => (
                <option key={t.id} value={t.id}>
                  {t.title}
                </option>
              ))}
            </select>
            <button
              type="button"
              disabled={!selectedTrackId || merging}
              onClick={handleMergeTrack}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white bg-[var(--link)] hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {merging ? (
                <>
                  <Loader2 size={14} className="animate-spin" />
                  Merging...
                </>
              ) : (
                <>
                  <Check size={14} />
                  Merge into track
                </>
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default OperationalModelDetailPage;
