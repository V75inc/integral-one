import { useState, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Plus, ClipboardList, MessageSquare } from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { tracksApi } from '../api';
import { apiResponseMessage } from '../lib/apiResponseMessage';
import { TrackModal } from '../components/tracks/TrackModal';
import { PinButton } from '../components/sidebar/PinButton';
import {
  Skeleton,
  EmptyState,
  Button,
  IconWell,
  LINE_ICON_STROKE,
  PageHeading,
  PageMeta,
  PageShell,
  PageSection,
  filterBar,
  SearchRow,
  PageSearchInput,
  TrackDot
} from '../components/ui';
import { formatRelativeTime } from '../utils';
import { humanizeFieldKey } from '../utils/humanizeFieldKey';
import { useSetCrumbs } from '../context/CrumbsContext';
import { useScope } from '../context/ScopeContext';
import { useAssistantDockOptional } from '../context/AssistantDockContext';
import { WorkspaceCreationRightsNotice } from '../components/collab/WorkspaceCreationRightsNotice';
import { useWorkspaceCreationRights } from '../hooks/useWorkspaceCreationRights';
import { tracksListQueryKey } from '../queryKeys';
import type { Track } from '../types';
import { usePublishPageContext } from '../hooks/usePublishPageContext';
import { upsertTrackInList } from '../utils/upsertTrackInList';
import { resolveIdentityColor } from '../utils';
import { isTrackNavVisible } from '../utils/trackNav';

type SectionKind = 'tracks' | 'anchor';

type TrackSection = {
  kind: SectionKind;
  appName: string;
  tracks: Track[];
};

function sortTracksByRecency(tracks: Track[]): Track[] {
  return [...tracks].sort((a, b) => {
    const da = a.updated_at || a.created_at || '';
    const db = b.updated_at || b.created_at || '';
    return db.localeCompare(da);
  });
}

/** Show actual Tracks only; App names belong on the Apps page. */
function buildTrackSections(tracks: Track[]): TrackSection[] {
  const standalone: Track[] = [];
  const anchored: Track[] = [];

  for (const t of tracks) {
    if (t.anchor_source) {
      anchored.push(t);
      continue;
    }
    standalone.push(t);
  }

  const sections: TrackSection[] = [];

  if (standalone.length) {
    sections.push({
      kind: 'tracks',
      appName: 'Tracks',
      tracks: sortTracksByRecency(standalone)
    });
  }
  if (anchored.length) {
    sections.push({
      kind: 'anchor',
      appName: 'Entry extensions',
      tracks: sortTracksByRecency(anchored)
    });
  }
  return sections;
}

function tracksPageErrorMessage(err: unknown): string {
  return apiResponseMessage(err, 'Failed to load tracks');
}

export function TracksPage() {
  useSetCrumbs([{ label: 'Tracks' }]);
  const navigate = useNavigate();
  const dock = useAssistantDockOptional();
  const { activeWorkspace } = useScope();
  const { canCreateTracks, lacksTrackCreationInOrg } = useWorkspaceCreationRights();
  const queryClient = useQueryClient();
  const scopeLabel = activeWorkspace?.name?.trim() || 'Workspace';
  const workspaceId = activeWorkspace?.id ?? '__none__';

  const openHarnessChat = () => {
    if (dock) {
      dock.openDock({ view: 'chat' });
      return;
    }
    navigate('/agent');
  };

  const tracksQuery = useQuery({
    queryKey: [...tracksListQueryKey(''), workspaceId] as const,
    queryFn: () => tracksApi.list({ limit: 100 }),
    enabled: Boolean(activeWorkspace?.id)
  });
  const tracks = useMemo(() => tracksQuery.data ?? [], [tracksQuery.data]);

  usePublishPageContext({
    pageKind: 'tracks_list',
    visibleData: {
      tracks: tracks.map((tr) => ({ id: tr.id, title: tr.title || undefined })),
      total_count: tracks.length,
    },
    metadata: {
      workspace_name: activeWorkspace?.name,
    },
  });
  const loading = tracksQuery.isPending;
  const error =
    tracksQuery.isError
      ? tracksPageErrorMessage(tracksQuery.error)
      : null;

  const [showModal, setShowModal] = useState(false);
  const [search, setSearch] = useState('');
  const [anchorExpanded, setAnchorExpanded] = useState(false);

  const reload = () => {
    void tracksQuery.refetch();
  };

  const q = search.trim().toLowerCase();
  const { filtered, sections } = useMemo(() => {
    const f = tracks.filter(t => {
      if (!isTrackNavVisible(t)) return false;
      if (!q) return true;
      return (
        t.title.toLowerCase().includes(q) ||
        (t.purpose || '').toLowerCase().includes(q) ||
        (t.app?.name || '').toLowerCase().includes(q) ||
        (t.anchor_source?.entry_title || '').toLowerCase().includes(q)
      );
    });
    const sec = buildTrackSections(f);
    return { filtered: f, sections: sec };
  }, [tracks, q]);
  const anchorSectionOpen = anchorExpanded || q.length > 0;

  return (
    <PageShell>
      <PageSection>
        <header className="mb-8 md:mb-10 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0">
            <PageHeading>Tracks</PageHeading>
            <PageMeta>
              <span>
                {!tracksQuery.data && (loading || error) ? '—' : tracks.length} {tracks.length === 1 ? 'track' : 'tracks'} in {scopeLabel}
              </span>
              <span aria-hidden>·</span>
              <span>Keep notes and updates together by project or topic</span>
            </PageMeta>
          </div>
          {canCreateTracks ? (
            <Button
              className="shrink-0 self-start sm:self-end w-full sm:w-auto"
              variant="primary"
              size="sm"
              icon={<Plus size={14} strokeWidth={LINE_ICON_STROKE} />}
              onClick={() => setShowModal(true)}
            >
              Manage Tracks
            </Button>
          ) : null}
          <WorkspaceCreationRightsNotice
            resource="tracks"
            show={lacksTrackCreationInOrg}
            className="mt-2 sm:mt-0 sm:ml-auto sm:max-w-md sm:text-right"
          />
        </header>
      </PageSection>

      <PageSection.Separator />

      <PageSection className={filterBar.sectionTop}>
        {error && (
          <div
            className="mb-6 rounded-[var(--radius-card)] border border-[color:var(--danger-fg)]/30 bg-[var(--danger-bg)] px-4 py-3 text-sm text-[var(--danger-fg)]"
            role="alert"
          >
            {error}
            <button type="button" className="ml-3 underline" onClick={reload}>
              Retry
            </button>
          </div>
        )}

        <SearchRow>
          <PageSearchInput
            value={search}
            onChange={setSearch}
            placeholder="Search tracks…"
          />
        </SearchRow>

        {loading ? (
          <div className="space-y-1">
            {[1, 2, 3, 4, 5].map(i => (
              <Skeleton key={i} className="h-14" />
            ))}
          </div>
        ) : error && filtered.length === 0 ? null : filtered.length === 0 ? (
          <EmptyState
            surface="card"
            icon={
              <IconWell size="lg" aria-hidden>
                <ClipboardList size={22} strokeWidth={LINE_ICON_STROKE} />
              </IconWell>
            }
            title={search ? 'No tracks found' : 'No tracks yet'}
            description={
              search
                ? 'Try a different search term.'
                : 'Create your first track to start organizing your work.'
            }
            action={
              !search ? (
                <div className="flex flex-wrap gap-2 justify-center">
                  {canCreateTracks ? (
                    <Button
                      variant="primary"
                      size="sm"
                      icon={<Plus size={14} strokeWidth={LINE_ICON_STROKE} />}
                      onClick={() => setShowModal(true)}
                    >
                      Manage Tracks
                    </Button>
                  ) : null}
                  <Button
                    variant={canCreateTracks ? 'ghost' : 'primary'}
                    size="sm"
                    icon={
                      <MessageSquare size={14} strokeWidth={LINE_ICON_STROKE} />
                    }
                    onClick={openHarnessChat}
                  >
                    Ask Integral for help
                  </Button>
                </div>
              ) : undefined
            }
          />
        ) : (
          <div className="flex flex-col gap-10">
            {sections.map(section => {
              const headingId =
                section.kind === 'anchor'
                  ? 'tracks-anchor-heading'
                  : 'tracks-heading';
              const isAnchor = section.kind === 'anchor';
              const showList = isAnchor ? anchorSectionOpen : true;
              return (
              <section
                key={
                  section.kind
                }
                aria-labelledby={headingId}
              >
                <div className="mb-3 flex items-baseline justify-between gap-3">
                  {isAnchor ? (
                    <button
                      type="button"
                      id={headingId}
                      onClick={() => setAnchorExpanded(v => !v)}
                      aria-expanded={anchorSectionOpen}
                      className="text-[12px] uppercase tracking-[0.16em] text-[var(--text-subtle)]/80 font-medium hover:text-[var(--text-muted)] transition-colors duration-fast inline-flex items-center gap-1.5"
                    >
                      <span
                        aria-hidden
                        className="inline-block w-2 text-center"
                      >
                        {anchorSectionOpen ? '▾' : '▸'}
                      </span>
                      {section.appName}
                    </button>
                  ) : (
                    <h2
                      id={headingId}
                      className="text-[13px] uppercase tracking-[0.16em] text-[var(--text-subtle)] font-medium"
                    >
                      {section.appName}
                    </h2>
                  )}
                  <span
                    className={
                      isAnchor
                        ? 'text-xs tabular-nums text-[var(--text-subtle)]/80'
                        : 'text-xs tabular-nums text-[var(--text-subtle)]'
                    }
                  >
                    {section.tracks.length}{' '}
                    {section.tracks.length === 1 ? 'track' : 'tracks'}
                  </span>
                </div>
                {showList && (
                <ul className="collection-list">
                  {section.tracks.map(t => (
                    <li
                      key={t.id}
                      className="
                        grid grid-cols-[auto_minmax(0,1fr)_auto_auto] gap-x-[18px] items-center
                        border-b border-[var(--border-subtle)] last:border-b-0
                        px-4 rounded-[2px]
                        transition-colors duration-fast
                        hover:bg-[var(--panel-2)]
                      "
                    >
                      <Link
                        to={`/tracks/${t.id}`}
                        className="
                          col-span-3 grid grid-cols-subgrid min-h-20 items-center py-4
                          focus-visible:outline-none
                        "
                      >
                        <TrackDot
                          color={resolveIdentityColor(t.accent_color, activeWorkspace?.accent_color)}
                          size="md"
                          className="shrink-0"
                          title={t.title}
                        />
                        <div className="min-w-0">
                          <p className="text-[15px] font-medium text-[var(--text)] truncate">
                            {t.title}
                          </p>
                          {isAnchor && t.anchor_source ? (
                            <p className="text-xs text-[var(--text-subtle)] mt-0.5 line-clamp-1">
                              Extends{' '}
                              <span className="text-[var(--text-muted)]">
                                {t.anchor_source.entry_title || 'entry'}
                              </span>
                              {t.anchor_source.field_key
                                ? ` · ${humanizeFieldKey(t.anchor_source.field_key)}`
                                : ''}
                            </p>
                          ) : t.purpose || t.description ? (
                            <p className="text-xs text-[var(--text-muted)] mt-0.5 line-clamp-1">
                              {t.purpose || t.description}
                            </p>
                          ) : null}
                        </div>
                        <div className="text-xs text-[var(--text-subtle)] tabular-nums shrink-0 text-right">
                          <div>
                            {t.entry_count || 0}{' '}
                            {(t.entry_count || 0) === 1 ? 'entry' : 'entries'}
                          </div>
                          {t.updated_at ? (
                            <div className="mt-0.5">
                              {formatRelativeTime(t.updated_at)}
                            </div>
                          ) : null}
                        </div>
                      </Link>
                      <PinButton kind="track" id={t.id} label={t.title} size="sm" />
                    </li>
                  ))}
                </ul>
                )}
              </section>
              );
            })}
          </div>
        )}

        <TrackModal
          open={showModal}
          onClose={() => setShowModal(false)}
          onCreated={async (track) => {
            const queryKey = [...tracksListQueryKey(''), workspaceId] as const;
            // A new account can still have its initial empty list request in
            // flight when the first Track is created. Cancel that snapshot,
            // then merge the server-acknowledged Track into the exact scoped
            // cache so a late empty response cannot hide the successful write.
            await queryClient.cancelQueries({ queryKey });
            queryClient.setQueryData<Track[]>(queryKey, (current) =>
              upsertTrackInList(current, track),
            );
          }}
        />
      </PageSection>
    </PageShell>
  );
}
