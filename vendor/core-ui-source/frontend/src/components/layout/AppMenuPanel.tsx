import { useEffect, useMemo } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ChevronLeft, Home, LayoutDashboard, Settings } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { appsApi, entriesApi, tracksApi } from '../../api';
import type { App, Entry, Track } from '../../types';
import { AppIcon } from '../../ui/AppIcon';
import { Text } from '../../ui/Text';
import { TrackDot } from '../ui/TrackDot';
import { isTrackNavVisible } from '../../utils/trackNav';
import { useScope } from '../../context/ScopeContext';
import { resolveIdentityColor } from '../../utils';

/** Width of the panel beside the icon rail, in pixels (the layout adds it to the main margin). */
export const APP_MENU_WIDTH = 232;

// Which App each Track belongs to, remembered in the browser so a Track page knows its App on the first paint
// (no expanded-then-collapsed flash while the Track loads). Filled from the App menu's own Track list and from
// each Track read; a stale entry is corrected as soon as the Track itself loads.
const TRACK_APP_KEY = 'integral:track-app';
let trackAppMemo: Record<string, string> | null = null;

function trackAppMap(): Record<string, string> {
  if (trackAppMemo) return trackAppMemo;
  try {
    trackAppMemo = JSON.parse(window.localStorage.getItem(TRACK_APP_KEY) || '{}') || {};
  } catch {
    trackAppMemo = {};
  }
  return trackAppMemo as Record<string, string>;
}

export function rememberTrackApps(entries: Array<[string, string]>): void {
  const map = trackAppMap();
  let changed = false;
  for (const [trackId, appId] of entries) {
    if (trackId && appId && map[trackId] !== appId) {
      map[trackId] = appId;
      changed = true;
    }
  }
  if (!changed) return;
  try {
    window.localStorage.setItem(TRACK_APP_KEY, JSON.stringify(map));
  } catch {
    /* storage unavailable: the menu still works, it only waits for the Track */
  }
}

/**
 * The App the current page belongs to: the App page, one of its Tracks, or an entry in one of its Tracks.
 * ``null`` elsewhere. A page known from before answers at once; an unknown one answers when it loads.
 */
export function useCurrentAppId(): { appId: string | null; trackId: string } {
  const { pathname } = useLocation();
  const appMatch = /^\/apps\/([^/?#]+)/.exec(pathname);
  const trackMatch = /^\/tracks\/([^/?#]+)/.exec(pathname);
  const entryMatch = /^\/entries\/([^/?#]+)/.exec(pathname);
  const entryId = entryMatch?.[1] ?? '';
  const entryQuery = useQuery({
    queryKey: ['app-menu', 'entry-track', entryId],
    queryFn: () => entriesApi.get(entryId),
    enabled: Boolean(entryId),
    staleTime: 5 * 60_000,
  });
  const entry = entryQuery.data as (Entry & { track?: Track }) | undefined;
  const trackId = trackMatch?.[1] ?? entry?.track_id ?? '';
  const appOnEntry = entry?.track?.app?.id || '';
  const trackQuery = useQuery({
    queryKey: ['app-menu', 'track-app', trackId],
    queryFn: () => tracksApi.get(trackId),
    enabled: Boolean(trackId) && !appOnEntry && !(entryId && trackAppMap()[trackId]),
    staleTime: 5 * 60_000,
  });
  const loaded = trackQuery.data as (Track & { app_id?: string }) | undefined;
  const loadedAppId = appOnEntry || (loaded ? loaded.app?.id || loaded.app_id || '' : undefined);
  useEffect(() => {
    const known: Array<[string, string]> = [];
    if (trackId && loadedAppId) known.push([trackId, loadedAppId]);
    if (entryId && loadedAppId) known.push([`entry:${entryId}`, loadedAppId]);
    if (known.length) rememberTrackApps(known);
  }, [trackId, entryId, loadedAppId]);
  if (appMatch) return { appId: decodeURIComponent(appMatch[1]), trackId: '' };
  if (!trackId && !entryId) return { appId: null, trackId: '' };
  if (loadedAppId !== undefined) return { appId: loadedAppId || null, trackId };
  const map = trackAppMap();
  return { appId: (entryId && map[`entry:${entryId}`]) || (trackId && map[trackId]) || null, trackId };
}

function orderTracks(tracks: Track[]): Track[] {
  return tracks.filter(isTrackNavVisible).sort((a, b) => {
    const ap = typeof a.position === 'number' ? a.position : Number.MAX_SAFE_INTEGER;
    const bp = typeof b.position === 'number' ? b.position : Number.MAX_SAFE_INTEGER;
    return ap - bp || a.title.localeCompare(b.title);
  });
}

function itemClass(active: boolean): string {
  return [
    'flex items-center gap-2.5 min-w-0 w-full rounded-[8px] px-2 py-[7px] text-sm transition-colors duration-fast',
    active
      ? 'bg-[var(--nav-active-bg)] text-[var(--text)] font-medium'
      : 'text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--panel)]',
  ].join(' ');
}

function PageLink({ to, label, icon: Icon, active }: { to: string; label: string; icon: LucideIcon; active: boolean }) {
  return (
    <NavLink to={to} className={itemClass(active)} aria-current={active ? 'page' : undefined}>
      <Icon size={16} strokeWidth={1.75} aria-hidden className="shrink-0" />
      <span className="truncate">{label}</span>
    </NavLink>
  );
}

/**
 * The menu of one App, beside the narrowed main menu: its Home and dashboards, each Track it lists, and its
 * settings. Generic for every App: it reads the App and its Tracks, nothing App-specific.
 */
export function AppMenuPanel({
  appId,
  activeTrackId,
  onClose,
}: {
  appId: string;
  /** The Track the current page is in (a Track page, or an entry's Track); highlighted in the list. */
  activeTrackId?: string;
  onClose: () => void;
}) {
  const location = useLocation();
  const { activeWorkspace } = useScope();
  const appQuery = useQuery({
    queryKey: ['app-menu', 'app', appId],
    queryFn: () => appsApi.get(appId),
    staleTime: 60_000,
  });
  const tracksQuery = useQuery({
    queryKey: ['app-menu', 'tracks', appId],
    queryFn: () => appsApi.listTracks(appId),
    staleTime: 60_000,
  });
  const app = appQuery.data as App | undefined;
  const tracks = useMemo(() => orderTracks(tracksQuery.data ?? []), [tracksQuery.data]);
  useEffect(() => {
    if (tracksQuery.data) rememberTrackApps(tracksQuery.data.map(track => [track.id, appId] as [string, string]));
  }, [tracksQuery.data, appId]);

  const onAppPage = location.pathname === `/apps/${appId}`;
  const section = new URLSearchParams(location.search).get('section');
  const homeActive = onAppPage && section !== 'dashboards' && section !== 'tracks';
  const dashboardsActive = onAppPage && section === 'dashboards';
  const name = app?.name?.trim() || 'App';

  return (
    <nav
      aria-label={`${name} menu`}
      className="fixed z-rail hidden md:flex flex-col border-r border-[var(--panel-border)] bg-[var(--section-bg)] text-[var(--text)]"
      style={{
        left: 60,
        width: APP_MENU_WIDTH,
        top: 'var(--system-bar-h, 0px)',
        height: 'calc(100dvh - var(--system-bar-h, 0px))',
      }}
      data-testid="app-menu-panel"
    >
      <div className="flex items-center gap-2 px-3 pt-4 pb-3">
        <AppIcon
          name={name}
          icon={app?.icon}
          color={resolveIdentityColor(app?.accent_color, activeWorkspace?.accent_color)}
          size="xs"
        />
        <Text as="span" variant="body" weight="semibold" className="flex-1 min-w-0 truncate" title={name}>
          {name}
        </Text>
        <button
          type="button"
          onClick={onClose}
          aria-label="Hide the App menu"
          title="Hide the App menu"
          className="rounded-[8px] p-1 text-[var(--text-muted)] hover:bg-[var(--panel)] hover:text-[var(--text)]"
        >
          <ChevronLeft size={16} strokeWidth={1.75} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-2 pb-3">
        <div className="flex flex-col gap-0.5">
          <PageLink to={`/apps/${appId}?section=home`} label="Home" icon={Home} active={homeActive} />
          <PageLink
            to={`/apps/${appId}?section=dashboards`}
            label="Dashboards"
            icon={LayoutDashboard}
            active={dashboardsActive}
          />
        </div>

        <Text as="p" variant="label" tone="muted" className="px-2 pt-4 pb-1.5 uppercase tracking-wide">
          Tracks
        </Text>
        {tracksQuery.isLoading ? (
          <Text as="p" variant="body-sm" tone="muted" className="px-2">
            Loading…
          </Text>
        ) : tracks.length === 0 ? (
          <Text as="p" variant="body-sm" tone="muted" className="px-2">
            No tracks yet.
          </Text>
        ) : (
          <div className="flex flex-col gap-0.5">
            {tracks.map(track => {
              const active = track.id === activeTrackId;
              return (
                <NavLink
                  key={track.id}
                  to={`/tracks/${track.id}`}
                  className={itemClass(active)}
                  aria-current={active ? 'page' : undefined}
                  title={track.title}
                >
                  <span className="flex h-4 w-4 shrink-0 items-center justify-center">
                    <TrackDot
                      icon={track.icon}
                      color={resolveIdentityColor(track.accent_color, activeWorkspace?.accent_color)}
                      size="sm"
                    />
                  </span>
                  <span className="truncate">{track.title || 'Untitled track'}</span>
                </NavLink>
              );
            })}
          </div>
        )}
      </div>

      <div className="border-t border-[var(--panel-border)] px-2 py-2">
        <PageLink to={`/apps/${appId}?settings=1`} label="Settings" icon={Settings} active={false} />
      </div>
    </nav>
  );
}
