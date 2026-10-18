/**
 * CommandPalette — ⌘K / Ctrl+K global launcher.
 *
 * Aggregates jump-to targets across workspaces, apps, tracks, and actions.
 * Pre-scoped to the active workspace; matches anywhere in label or
 * sublabel. Keyboard-first: ArrowUp/Down navigates, Enter activates,
 * Escape closes. Click-outside closes too.
 *
 * Deliberately lib-free — the project doesn't yet use cmdk/Radix. This
 * implementation stays under ~200 lines and uses only the existing
 * design tokens.
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Building2,
  FolderOpen,
  LayoutGrid,
  MessageSquare,
  Pin,
  Search,
  ArrowRight,
} from 'lucide-react';
import { LINE_ICON_STROKE } from '../ui';
import { appsApi, entriesApi, tracksApi } from '../../api';
import { tracksListQueryKey } from '../../queryKeys';
import { useScope } from '../../context/ScopeContext';
import { isOwnedPersonalWorkspace, workspaceAccessLabel } from '../../api/workspaces';
import { useAssistantDockOptional } from '../../context/AssistantDockContext';
import { usePinned } from '../../hooks/usePinned';
import type { App, Entry as EntryRow, Track } from '../../types';
import { resolveIdentityColor } from '../../utils';
import { isTrackNavVisible } from '../../utils/trackNav';

interface Entry {
  id: string;
  group: 'Workspaces' | 'Pinned' | 'Apps' | 'Tracks' | 'Entries' | 'Actions';
  label: string;
  sublabel?: string;
  accent?: string;
  icon?: React.ReactNode;
  onSelect: () => void;
}

const MAX_PER_GROUP = 6;

interface Props {
  open: boolean;
  onClose: () => void;
}

export function CommandPalette({ open, onClose }: Props) {
  const navigate = useNavigate();
  const dock = useAssistantDockOptional();
  const { scope, workspaces, activeWorkspace, setScope } = useScope();
  const workspaceId = scope?.workspaceId ?? '__none__';
  const { pinned } = usePinned();
  const [query, setQuery] = useState('');
  const [activeIdx, setActiveIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // Reset on open.
  useEffect(() => {
    if (open) {
      setQuery('');
      setActiveIdx(0);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  // Esc / click-outside to close.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const tracksQuery = useQuery({
    queryKey: [...tracksListQueryKey(''), workspaceId] as const,
    queryFn: () => tracksApi.list({ limit: 100 }),
    enabled: open,
    staleTime: 30_000,
  });
  const appsQuery = useQuery({
    queryKey: ['apps', 'list', 'palette', workspaceId] as const,
    queryFn: () => appsApi.list(),
    enabled: open,
    staleTime: 30_000,
  });

  // B-CMD-02: index Entries in the palette. Hot-fetch only when the user
  // has typed ≥2 characters — listing every entry on every palette open
  // would slam the API and bloat the result list. Debounce 200ms then
  // hit /entries?query=...; the backend handles substring matching.
  const [debouncedQuery, setDebouncedQuery] = useState('');
  useEffect(() => {
    if (!open) return;
    const handle = window.setTimeout(() => {
      setDebouncedQuery(query.trim());
    }, 200);
    return () => window.clearTimeout(handle);
  }, [query, open]);
  const entriesQuery = useQuery({
    queryKey: ['entries', 'palette', workspaceId, debouncedQuery] as const,
    queryFn: () =>
      entriesApi.list({ query: debouncedQuery, limit: 8 }),
    enabled: open && debouncedQuery.length >= 2,
    staleTime: 15_000,
  });

  const allEntries = useMemo<Entry[]>(() => {
    const list: Entry[] = [];

    // Workspaces — every workspace the user belongs to. Switches scope.
    for (const ws of workspaces) {
      const isOwnedPersonal = isOwnedPersonalWorkspace(ws);
      list.push({
        id: `scope:ws:${ws.id}`,
        group: 'Workspaces',
        label: ws.name?.trim() || (isOwnedPersonal ? 'Personal' : 'Workspace'),
        sublabel: `Switch to ${workspaceAccessLabel(ws).toLowerCase()} workspace`,
        accent: ws.accent_color,
        icon: isOwnedPersonal ? (
          <Building2 size={14} strokeWidth={LINE_ICON_STROKE} />
        ) : undefined,
        onSelect: () => {
          setScope({ workspaceId: ws.id });
          onClose();
        },
      });
    }

    // /tracks and /apps are workspace-scoped server-side via the
    // X-Integral-Scope header; the response already excludes other
    // workspaces, so we render it as-is.
    const scopedTracks: Track[] = tracksQuery.data || [];
    const scopedApps: App[] = appsQuery.data || [];

    // Pinned (active-scope only).
    const pinnedSet = {
      tracks: new Set(pinned.tracks),
      apps: new Set(pinned.apps),
    };
    for (const s of scopedApps) {
      if (!pinnedSet.apps.has(s.id)) continue;
      list.push({
        id: `pinned:app:${s.id}`,
        group: 'Pinned',
        label: s.name?.trim() || 'Untitled app',
        sublabel: 'Pinned app',
        accent: resolveIdentityColor(s.accent_color, activeWorkspace?.accent_color),
        icon: <Pin size={14} strokeWidth={LINE_ICON_STROKE} />,
        onSelect: () => {
          navigate(`/apps/${s.id}`);
          onClose();
        },
      });
    }
    for (const t of scopedTracks) {
      if (!pinnedSet.tracks.has(t.id)) continue;
      list.push({
        id: `pinned:track:${t.id}`,
        group: 'Pinned',
        label: t.title?.trim() || 'Untitled track',
        sublabel: t.app?.name?.trim() || 'Pinned track',
        accent: resolveIdentityColor(t.accent_color, activeWorkspace?.accent_color),
        icon: <Pin size={14} strokeWidth={LINE_ICON_STROKE} />,
        onSelect: () => {
          navigate(`/tracks/${t.id}`);
          onClose();
        },
      });
    }

    // Apps.
    for (const s of scopedApps) {
      if (pinnedSet.apps.has(s.id)) continue;
      list.push({
        id: `app:${s.id}`,
        group: 'Apps',
        label: s.name?.trim() || 'Untitled app',
        sublabel: s.description?.trim() || undefined,
        accent: resolveIdentityColor(s.accent_color, activeWorkspace?.accent_color),
        icon: <FolderOpen size={14} strokeWidth={LINE_ICON_STROKE} />,
        onSelect: () => {
          navigate(`/apps/${s.id}`);
          onClose();
        },
      });
    }

    // Tracks (browse) — hide nav_visible=false; pinned section above still
    // surfaces an already-pinned line track if the user chose to pin it.
    for (const t of scopedTracks) {
      if (pinnedSet.tracks.has(t.id)) continue;
      if (!isTrackNavVisible(t)) continue;
      list.push({
        id: `track:${t.id}`,
        group: 'Tracks',
        label: t.title?.trim() || 'Untitled track',
        sublabel: t.app?.name?.trim() || undefined,
        accent: resolveIdentityColor(t.accent_color, activeWorkspace?.accent_color),
        icon: <LayoutGrid size={14} strokeWidth={LINE_ICON_STROKE} />,
        onSelect: () => {
          navigate(`/tracks/${t.id}`);
          onClose();
        },
      });
    }

    // Entries — only when the user has typed ≥2 chars. Limit 8 results
    // so the section doesn't overwhelm the palette.
    const scopedEntries: EntryRow[] = entriesQuery.data || [];
    for (const e of scopedEntries.slice(0, 8)) {
      const trackTitle =
        scopedTracks.find(t => t.id === e.track_id)?.title?.trim() || '';
      list.push({
        id: `entry:${e.id}`,
        group: 'Entries',
        label: e.title?.trim() || '(untitled entry)',
        sublabel: trackTitle || undefined,
        icon: <Search size={14} strokeWidth={LINE_ICON_STROKE} />,
        onSelect: () => {
          if (e.track_id) {
            navigate(`/tracks/${e.track_id}?entry=${e.id}`);
          } else {
            navigate(`/feed`);
          }
          onClose();
        },
      });
    }

    // Actions.
    list.push({
      id: 'action:open-harness',
      group: 'Actions',
      label: 'Ask Integral',
      sublabel: 'Ask a question or get help with your work',
      icon: <MessageSquare size={14} strokeWidth={LINE_ICON_STROKE} />,
      onSelect: () => {
        if (dock) {
          dock.openDock({ view: 'chat' });
          onClose();
          return;
        }
        navigate('/agent');
        onClose();
      },
    });
    list.push({
      id: 'action:new-track',
      group: 'Actions',
      label: 'New track',
      sublabel: 'Open the tracks page to create one',
      icon: <ArrowRight size={14} strokeWidth={LINE_ICON_STROKE} />,
      onSelect: () => {
        navigate('/tracks');
        onClose();
      },
    });
    list.push({
      id: 'action:new-app',
      group: 'Actions',
      label: 'New app',
      sublabel: 'Open the Apps page to create one',
      icon: <ArrowRight size={14} strokeWidth={LINE_ICON_STROKE} />,
      onSelect: () => {
        navigate('/apps');
        onClose();
      },
    });
    list.push({
      id: 'action:invite',
      group: 'Actions',
      label: 'Invite to organization',
      sublabel: 'Open organization members',
      icon: <ArrowRight size={14} strokeWidth={LINE_ICON_STROKE} />,
      onSelect: () => {
        const active = workspaces.find(w => w.id === scope?.workspaceId);
        if (active && active.kind === 'organization') {
          navigate(`/workspaces/${active.id}/members`);
        } else {
          navigate('/workspaces');
        }
        onClose();
      },
    });

    return list;
  }, [
    workspaces,
    activeWorkspace?.accent_color,
    scope,
    pinned,
    tracksQuery.data,
    appsQuery.data,
    entriesQuery.data,
    navigate,
    onClose,
    setScope,
    dock,
  ]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return allEntries;
    return allEntries.filter(e => {
      const hay = `${e.label} ${e.sublabel || ''}`.toLowerCase();
      return hay.includes(q);
    });
  }, [allEntries, query]);

  // Group + cap. Iteration order matters — Object.values respects key
  // insertion. We seed an empty record with the desired group sequence
  // so the palette always renders Workspaces → Pinned → Apps → Tracks →
  // Entries → Actions even when some groups are absent.
  const grouped = useMemo(() => {
    const out: Record<string, Entry[]> = {
      Workspaces: [],
      Pinned: [],
      Apps: [],
      Tracks: [],
      Entries: [],
      Actions: [],
    };
    for (const e of filtered) {
      (out[e.group] ||= []).push(e);
    }
    for (const k of Object.keys(out)) {
      out[k] = out[k].slice(0, MAX_PER_GROUP);
    }
    return out;
  }, [filtered]);

  const flatVisible = useMemo<Entry[]>(
    () => Object.values(grouped).flat(),
    [grouped]
  );

  useEffect(() => {
    if (activeIdx >= flatVisible.length) setActiveIdx(0);
  }, [flatVisible.length, activeIdx]);

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActiveIdx(i => Math.min(i + 1, flatVisible.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActiveIdx(i => Math.max(i - 1, 0));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        const item = flatVisible[activeIdx];
        if (item) item.onSelect();
      }
    },
    [flatVisible, activeIdx]
  );

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Command palette"
      className="fixed inset-0 z-palette flex items-start justify-center pt-[10vh] px-4"
    >
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden
      />
      <div
        className="relative w-full max-w-xl rounded-xl border border-[var(--panel-border)] bg-[var(--panel)] shadow-[var(--shadow-pop)] overflow-hidden"
        onKeyDown={onKeyDown}
      >
        <div className="flex items-center gap-2 px-3 py-2.5 border-b border-[var(--panel-border)]">
          <Search size={16} strokeWidth={LINE_ICON_STROKE} className="text-[var(--text-subtle)] shrink-0" />
          <input
            ref={inputRef}
            type="text"
            placeholder="Jump to a workspace, app, track, or entry by name…"
            value={query}
            onChange={e => {
              setQuery(e.target.value);
              setActiveIdx(0);
            }}
            className="flex-1 bg-transparent outline-none text-[15px] text-[var(--text)] placeholder:text-[var(--text-subtle)]"
            aria-label="Command palette search"
          />
          <kbd className="text-[10px] uppercase tracking-wider text-[var(--text-subtle)] border border-[var(--panel-border)] rounded px-1.5 py-0.5">
            Esc
          </kbd>
        </div>
        <div className="max-h-[60vh] overflow-y-auto py-1">
          {flatVisible.length === 0 ? (
            <p className="px-4 py-6 text-sm text-[var(--text-muted)] text-center">
              No matches.
            </p>
          ) : (
            Object.entries(grouped).map(([group, items]) =>
              items.length === 0 ? null : (
                <div key={group} className="px-1 pb-1">
                  <p className="px-3 pt-2 pb-1 text-[10px] uppercase tracking-[0.08em] font-medium text-[var(--text-subtle)]">
                    {group}
                  </p>
                  {items.map(entry => {
                    const idxInFlat = flatVisible.findIndex(x => x.id === entry.id);
                    const active = idxInFlat === activeIdx;
                    return (
                      <button
                        key={entry.id}
                        type="button"
                        onMouseEnter={() => setActiveIdx(idxInFlat)}
                        onClick={() => entry.onSelect()}
                        className={[
                          'w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-left',
                          active
                            ? 'bg-[var(--nav-active-bg)] text-[var(--nav-active-fg)]'
                            : 'text-[var(--text)] hover:bg-[var(--panel-2)]',
                          'transition-colors duration-fast',
                        ].join(' ')}
                      >
                        {entry.accent ? (
                          <span
                            aria-hidden
                            className="block w-[3px] h-[16px] rounded-[1.5px] shrink-0"
                            style={{ backgroundColor: entry.accent }}
                          />
                        ) : entry.icon ? (
                          <span className="text-[var(--text-muted)] shrink-0">
                            {entry.icon}
                          </span>
                        ) : null}
                        <span className="flex-1 min-w-0">
                          <span className="block truncate text-sm font-medium">
                            {entry.label}
                          </span>
                          {entry.sublabel ? (
                            <span className="block truncate text-xs text-[var(--text-muted)]">
                              {entry.sublabel}
                            </span>
                          ) : null}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )
            )
          )}
        </div>
        <div className="px-3 py-2 border-t border-[var(--panel-border)] flex items-center justify-between text-[11px] text-[var(--text-subtle)]">
          <span>
            <kbd className="border border-[var(--panel-border)] rounded px-1">↑↓</kbd>{' '}
            navigate ·{' '}
            <kbd className="border border-[var(--panel-border)] rounded px-1">↵</kbd>{' '}
            select
          </span>
          <span>{flatVisible.length} result{flatVisible.length === 1 ? '' : 's'}</span>
        </div>
      </div>
    </div>
  );
}
