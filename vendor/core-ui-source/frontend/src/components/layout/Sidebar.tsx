import { useDeployment } from '../../hooks/useDeployment';
import { AppIcon } from '../../ui';
/**
 * Sidebar — application chrome left rail.
 *
 * Reference design (Quiet Premium dark):
 *   - Logo + wordmark at top
 *   - Three eyebrow sections: WORKSPACE / TRACKS / SPACES
 *   - WORKSPACE items lead with a subtle dot bullet
 *   - TRACK / APP items lead with an identity marker in their accent color
 *     (vertical bar in sidebar, TrackDot in list rows)
 *   - Active item is a subtle pill highlight (--nav-active-bg)
 *   - Bottom: account menu — profile + sign out (theme toggle in TopBar)
 *   - No right border; sidebar bg matches main bg so the edge dissolves
 *
 * Mobile: behaves as an off-canvas drawer over the main content.
 */

import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { getRegisteredSidebarAccountActions } from '../../host/registry';
import {
  Bell,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  HelpCircle,
  ChevronsUpDown,
  Home as HomeIcon,
  LayoutGrid,
  List as ListIcon,
  ListTodo,
  LogOut,
  MessageSquare,
  User as UserIcon,
  Pin,
  Rss,
  Settings as SettingsIcon,
  Shield,
  ShieldCheck,
  X,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { usePlatformAdmin } from '../../hooks/usePlatformAdmin';
import { useScope } from '../../context/ScopeContext';
import { Avatar, LINE_ICON_STROKE, Logo } from '../ui';
import { tracksApi, appsApi } from '../../api';
import { tracksListQueryKey } from '../../queryKeys';
import type { App, Track, User } from '../../types';
import { WorkspaceSwitcher } from './WorkspaceSwitcher';
import { resolveIdentityColor } from '../../utils';
import { SidebarScroller } from './SidebarScroller';
import { PinButton } from '../sidebar/PinButton';
import { usePinned } from '../../hooks/usePinned';
import {
  buildPinnedSidebarEntries,
  type PinnedSidebarEntry,
} from './pinnedSidebarEntries';
import {
  getCollapsiblePinnedAppIds,
  usePinnedSidebarCollapse,
} from './pinnedSidebarCollapse';

interface SidebarProps {
  collapsed: boolean;
  onToggleCollapsed: () => void;
  mobileOpen: boolean;
  onMobileOpenChange: (open: boolean) => void;
  isDesktop: boolean;
}

/** Section eyebrow — uppercase 10px, 0.08em tracking, weight 500,
 *  --text-subtle (matches Quiet Premium spec exactly). */
function SectionEyebrow({ children }: { children: ReactNode }) {
  return (
    <p className="ml-2 mb-2.5 text-[12px] uppercase tracking-[0.08em] font-medium text-[var(--text-subtle)]">
      {children}
    </p>
  );
}

/** Hover/focus reveal tooltip for collapsed-rail items. Anchored to the
 *  right of the rail so it floats over the page surface without resizing
 *  the rail. Portaled outside the scrolling rail on parent hover or focus.
 *
 *  Color: bg=--text, fg=--bg — the inverse of the surrounding canvas in
 *  both themes. Yields a high-contrast popover that doesn't blend into
 *  the near-black --bg of dark mode (where --panel is only 7 points
 *  lighter and gets lost). */
function CollapsedTooltip({ label }: { label: string }) {
  const anchorRef = useRef<HTMLSpanElement>(null);
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null);

  useEffect(() => {
    const parent = anchorRef.current?.parentElement;
    if (!parent) return;
    const show = () => {
      const rect = parent.getBoundingClientRect();
      setPosition({ left: rect.right + 12, top: rect.top + rect.height / 2 });
    };
    const hide = () => setPosition(null);
    const reposition = () => {
      if (parent.matches(':hover, :focus-within')) show();
      else hide();
    };
    parent.addEventListener('mouseenter', show);
    parent.addEventListener('mouseleave', hide);
    parent.addEventListener('focusin', show);
    parent.addEventListener('focusout', hide);
    window.addEventListener('resize', hide);
    document.addEventListener('scroll', reposition, true);
    return () => {
      parent.removeEventListener('mouseenter', show);
      parent.removeEventListener('mouseleave', hide);
      parent.removeEventListener('focusin', show);
      parent.removeEventListener('focusout', hide);
      window.removeEventListener('resize', hide);
      document.removeEventListener('scroll', reposition, true);
    };
  }, []);

  return (
    <>
      <span ref={anchorRef} hidden />
      {position && createPortal(
        <span
          aria-hidden
          className="pointer-events-none fixed -translate-y-1/2 px-2.5 py-1.5 rounded-md bg-[var(--text)] text-[var(--bg)] shadow-[var(--shadow-pop)] text-xs font-medium whitespace-nowrap z-50"
          style={position}
        >
          {label}
        </span>,
        document.body,
      )}
    </>
  );
}

/** Standard nav item — 14px text, 7px 8px padding, gap 10px, ink-2.
 *  Hover swaps bg to --line-2 and ink to full. Active state inverts:
 *  bg --ink, color --bg, font-weight 500. The inversion matches the
 *  reference's stronger active treatment (not a subtle pill). */
function NavItem({
  to,
  label,
  sublabel,
  end,
  onClick,
  leading,
  trailing,
  collapsed,
  tooltip,
}: {
  to: string;
  label: string;
  /** Optional muted second line (e.g. parent App name for a Track). */
  sublabel?: string;
  end?: boolean;
  onClick?: () => void;
  /** Optional leading slot (e.g. TrackDot). Defaults to a 6×6 generic
   *  --text-subtle bullet. */
  leading?: ReactNode;
  /** Optional trailing slot (e.g. pin/star toggle). Hidden when collapsed. */
  trailing?: ReactNode;
  /** When true, hide the label and tighten padding for the rail-collapsed mode. */
  collapsed?: boolean;
  /** Override the tooltip shown in collapsed mode (defaults to label). */
  tooltip?: string;
}) {
  const collapsedTip = tooltip || (sublabel ? `${label} — ${sublabel}` : label);
  return (
    <NavLink
      to={to}
      end={end}
      onClick={onClick}
      aria-label={collapsed ? collapsedTip : undefined}
      title={!collapsed && sublabel ? `${label} — ${sublabel}` : undefined}
      className={({ isActive }) => [
        'group relative flex items-center gap-2.5 min-w-0 w-full',
        collapsed ? 'px-1.5 py-[7px] justify-center' : 'px-2 py-[7px]',
        'rounded-[8px]',
        'text-sm transition-colors duration-fast',
        isActive
          ? 'bg-[var(--text)] text-[var(--bg)] font-medium'
          : 'text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--panel)]',
      ].join(' ')}
    >
      {leading ?? (
        <span
          aria-hidden
          className="block w-[3px] h-[14px] rounded-[1.5px] bg-[var(--text-subtle)] shrink-0 group-[.active]:bg-[var(--bg)]"
        />
      )}
      {collapsed ? (
        <CollapsedTooltip label={collapsedTip} />
      ) : (
        <span className="flex-1 min-w-0 leading-tight">
          <span className="block truncate">{label}</span>
          {sublabel ? (
            <span
              aria-hidden
              className="block truncate text-[11px] uppercase tracking-[0.04em] text-[var(--text-subtle)] group-hover:text-[var(--text-muted)] mt-0.5"
            >
              {sublabel}
            </span>
          ) : null}
        </span>
      )}
      {!collapsed && trailing ? (
        <span className="shrink-0 ml-1 flex items-center">{trailing}</span>
      ) : null}
    </NavLink>
  );
}

/** Inconspicuous nav item — smaller text, muted color, no active inversion.
 *  Used for utility links (Notifications, Settings) that should not compete
 *  with the primary Workspace / Tracks / Apps hierarchy. */
function SecondaryNavItem({
  to,
  label,
  icon,
  onClick,
  collapsed,
}: {
  to: string;
  label: string;
  icon: ReactNode;
  onClick?: () => void;
  collapsed?: boolean;
}) {
  return (
    <NavLink
      to={to}
      onClick={onClick}
      aria-label={collapsed ? label : undefined}
      className={({ isActive }) => [
        'group relative flex items-center gap-2 min-w-0 w-full',
        collapsed ? 'px-1.5 py-1.5 justify-center' : 'px-2 py-1.5',
        'rounded-[var(--radius-input)]',
        'text-xs transition-colors duration-fast',
        isActive
          ? 'text-[var(--text)] bg-[var(--panel)]'
          : 'text-[var(--text-subtle)] hover:text-[var(--text-muted)] hover:bg-[var(--panel)]',
      ].join(' ')}
    >
      <span className="shrink-0" aria-hidden>
        {icon}
      </span>
      {collapsed ? (
        <CollapsedTooltip label={label} />
      ) : (
        <span className="truncate">{label}</span>
      )}
    </NavLink>
  );
}

function TrackAccentDot({
  title,
  accentColor,
}: {
  title?: string;
  accentColor?: string;
}) {
  return (
    <span
      aria-hidden
      title={title}
      className="block w-[3px] h-[14px] rounded-[1.5px] shrink-0"
      style={{
        backgroundColor: accentColor?.trim() || 'var(--brand-accent)',
      }}
    />
  );
}

function PinnedNestedTracks({
  tracks,
  onNavigate,
  collapsed,
  trackTitle,
}: {
  tracks: Track[];
  onNavigate: () => void;
  collapsed?: boolean;
  trackTitle: (t: Track) => string;
}) {
  if (!tracks.length) return null;
  return (
    <div
      className={
        collapsed
          ? 'flex flex-col gap-0.5'
          : 'ml-2 pl-2.5 border-l border-[var(--border-subtle)] flex flex-col gap-0.5'
      }
    >
      {tracks.map(t => (
        <NavItem
          key={t.id}
          to={`/tracks/${t.id}`}
          label={trackTitle(t)}
          onClick={onNavigate}
          collapsed={collapsed}
          tooltip={trackTitle(t)}
          leading={
            <TrackAccentDot title={t.title} accentColor={t.accent_color} />
          }
          trailing={
            <PinButton
              kind="track"
              id={t.id}
              label={t.title?.trim() || 'track'}
              size="sm"
            />
          }
        />
      ))}
    </div>
  );
}

/** Pinned section label with optional collapse / expand all control. */
function PinnedSectionHeader({
  showBulkControls,
  allCollapsed,
  onToggleAll,
}: {
  showBulkControls: boolean;
  allCollapsed: boolean;
  onToggleAll: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-2 mb-2.5 ml-2 mr-0.5 min-h-[18px]">
      <p className="text-[12px] uppercase tracking-[0.08em] font-medium text-[var(--text-subtle)]">
        Pinned
      </p>
      {showBulkControls ? (
        <button
          type="button"
          onClick={onToggleAll}
          className="
            shrink-0 px-1.5 py-0.5 rounded-md
            text-[10px] uppercase tracking-[0.06em] font-medium
            text-[var(--text-subtle)] hover:text-[var(--text-muted)] hover:bg-[var(--panel)]
            transition-colors duration-fast
            focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring-color)]
          "
        >
          {allCollapsed ? 'Expand all' : 'Collapse all'}
        </button>
      ) : null}
    </div>
  );
}

/** Collapsible app row — pinned apps with tracks, or multi-track app groups. */
function PinnedAppCollapsibleRow({
  appId,
  appName,
  icon,
  accentColor,
  trackCount,
  expanded,
  onToggle,
  onNavigate,
  trailing,
}: {
  appId: string;
  appName: string;
  icon?: string;
  accentColor?: string;
  trackCount: number;
  expanded: boolean;
  onToggle: () => void;
  onNavigate: () => void;
  trailing?: ReactNode;
}) {
  const countLabel =
    trackCount === 1 ? '1 track' : `${trackCount} tracks`;

  return (
    <div className="flex items-center gap-0.5 min-w-0 w-full">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        aria-label={`${expanded ? 'Collapse' : 'Expand'} ${appName} (${countLabel})`}
        className="shrink-0 inline-flex items-center justify-center w-7 h-7 rounded-md text-[var(--text-subtle)] hover:text-[var(--text)] hover:bg-[var(--panel)] transition-colors duration-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring-color)]"
      >
        {expanded ? (
          <ChevronDown size={14} strokeWidth={LINE_ICON_STROKE} aria-hidden />
        ) : (
          <ChevronRight size={14} strokeWidth={LINE_ICON_STROKE} aria-hidden />
        )}
      </button>
      <NavLink
        to={`/apps/${appId}`}
        onClick={onNavigate}
        title={!expanded ? `${appName} — ${countLabel}` : appName}
        className={({ isActive }) =>
          [
            'group flex items-center gap-2.5 min-w-0 flex-1',
            'px-2 py-[7px] rounded-[8px]',
            'text-sm transition-colors duration-fast',
            isActive
              ? 'bg-[var(--text)] text-[var(--bg)] font-medium'
              : 'text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--panel)]',
          ].join(' ')
        }
      >
        <AppIcon name={appName} icon={icon} color={accentColor} size="xs" />
        <span className="flex-1 min-w-0 flex items-center gap-1.5">
          <span className="truncate">{appName}</span>
          {!expanded && trackCount > 0 ? (
            <span
              aria-hidden
              className="shrink-0 text-[11px] tabular-nums text-[var(--text-subtle)] group-hover:text-[var(--text-muted)]"
            >
              {trackCount}
            </span>
          ) : null}
        </span>
      </NavLink>
      {trailing ? (
        <span className="shrink-0 flex items-center">{trailing}</span>
      ) : null}
    </div>
  );
}

function pinnedEntryAppId(entry: PinnedSidebarEntry): string | null {
  if (entry.kind === 'app') return entry.app.id;
  if (entry.kind === 'app-group') return entry.appId;
  return null;
}

function renderPinnedEntry(
  entry: PinnedSidebarEntry,
  opts: {
    railCollapsed: boolean;
    closeMobile: () => void;
    trackTitle: (t: Track) => string;
    trackSubtitle: (t: Track) => string | undefined;
    isAppExpanded: (appId: string) => boolean;
    toggleAppGroup: (appId: string) => void;
  }
) {
  const {
    railCollapsed,
    closeMobile,
    trackTitle,
    trackSubtitle,
    isAppExpanded,
    toggleAppGroup,
  } = opts;

  if (entry.kind === 'app') {
    const s = entry.app;
    const appName = s.name?.trim() || 'Untitled app';
    const pinTrailing = (
      <PinButton kind="app" id={s.id} label={appName} size="sm" />
    );

    if (entry.tracks.length === 0) {
      return (
        <NavItem
          key={`app:${s.id}`}
          to={`/apps/${s.id}`}
          label={appName}
          onClick={closeMobile}
          collapsed={railCollapsed}
          leading={
            <AppIcon name={s.name} icon={s.icon} color={s.accent_color} size="xs" />
          }
          trailing={pinTrailing}
        />
      );
    }

    const expanded = isAppExpanded(s.id);
    return (
      <div key={`app:${s.id}`} className="flex flex-col gap-0.5">
        <PinnedAppCollapsibleRow
          appId={s.id}
          appName={appName}
          icon={s.icon}
          accentColor={s.accent_color}
          trackCount={entry.tracks.length}
          expanded={expanded}
          onToggle={() => toggleAppGroup(s.id)}
          onNavigate={closeMobile}
          trailing={pinTrailing}
        />
        {expanded ? (
          <PinnedNestedTracks
            tracks={entry.tracks}
            onNavigate={closeMobile}
            trackTitle={trackTitle}
          />
        ) : null}
      </div>
    );
  }

  if (entry.kind === 'app-group') {
    const expanded = isAppExpanded(entry.appId);
    return (
      <div key={`group:${entry.appId}`} className="flex flex-col gap-0.5">
        <PinnedAppCollapsibleRow
          appId={entry.appId}
          appName={entry.appName}
          accentColor={entry.accentColor}
          trackCount={entry.tracks.length}
          expanded={expanded}
          onToggle={() => toggleAppGroup(entry.appId)}
          onNavigate={closeMobile}
        />
        {expanded ? (
          <PinnedNestedTracks
            tracks={entry.tracks}
            onNavigate={closeMobile}
            trackTitle={trackTitle}
          />
        ) : null}
      </div>
    );
  }

  const t = entry.track;
  return (
    <NavItem
      key={t.id}
      to={`/tracks/${t.id}`}
      label={trackTitle(t)}
      sublabel={trackSubtitle(t)}
      onClick={closeMobile}
      collapsed={railCollapsed}
      leading={
        <TrackAccentDot title={t.title} accentColor={t.accent_color} />
      }
      trailing={
        <PinButton
          kind="track"
          id={t.id}
          label={t.title?.trim() || 'track'}
          size="sm"
        />
      }
    />
  );
}

function SidebarAccountMenu({
  user,
  collapsed,
  onLogout,
  onDismissMobile,
}: {
  user: User | null;
  collapsed: boolean;
  onLogout: () => void;
  onDismissMobile: () => void;
}) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const [popoverPos, setPopoverPos] = useState<{
    top: number;
    left: number;
    width: number;
  } | null>(null);

  const displayName = user?.display_name?.trim() || 'Account';

  useLayoutEffect(() => {
    if (!open || !triggerRef.current) return;
    const compute = () => {
      const rect = triggerRef.current!.getBoundingClientRect();
      setPopoverPos({
        top: rect.top - 6,
        left: rect.left,
        width: Math.max(200, rect.width),
      });
    };
    compute();
    window.addEventListener('resize', compute);
    window.addEventListener('scroll', compute, true);
    return () => {
      window.removeEventListener('resize', compute);
      window.removeEventListener('scroll', compute, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      const t = e.target as Node;
      if (triggerRef.current?.contains(t)) return;
      if (popoverRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onEsc);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onEsc);
    };
  }, [open]);

  const goProfile = () => {
    setOpen(false);
    onDismissMobile();
    navigate('/settings#profile');
  };

  const signOut = () => {
    setOpen(false);
    onLogout();
  };

  const hostActions = getRegisteredSidebarAccountActions();

  const popoverNode =
    open && popoverPos ? (
      <div
        ref={popoverRef}
        role="menu"
        aria-label="Account"
        style={{
          position: 'fixed',
          top: popoverPos.top,
          left: popoverPos.left,
          width: popoverPos.width,
          transform: 'translateY(-100%)',
        }}
        className="
          z-popover
          rounded-lg border border-[var(--panel-border)] bg-[var(--panel)]
          shadow-[var(--shadow-pop)] p-1
        "
      >
        <button
          type="button"
          role="menuitem"
          onClick={goProfile}
          className="
            w-full flex items-center gap-2.5 px-2 py-1.5 rounded-md text-left
            text-sm text-[var(--text)]
            hover:bg-[var(--panel-2)]
            focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring-color)]
            transition-colors duration-fast
          "
        >
          <span
            className="inline-flex items-center justify-center w-[22px] h-[22px] rounded-md bg-[var(--panel-2)] text-[var(--text-muted)] shrink-0"
            aria-hidden
          >
            <UserIcon size={12} strokeWidth={LINE_ICON_STROKE} />
          </span>
          View profile
        </button>
        <button
          type="button"
          role="menuitem"
          onClick={() => { setOpen(false); onDismissMobile(); navigate('/settings#help'); }}
          className="w-full flex items-center gap-2.5 px-2 py-1.5 rounded-md text-left text-sm text-[var(--text)] hover:bg-[var(--panel-2)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring-color)] transition-colors duration-fast"
        >
          <span className="inline-flex items-center justify-center w-[22px] h-[22px] rounded-md bg-[var(--panel-2)] text-[var(--text-muted)] shrink-0" aria-hidden>
            <HelpCircle size={12} strokeWidth={LINE_ICON_STROKE} />
          </span>
          Help and getting started
        </button>
        {hostActions.map(action => (
          <button
            key={action.id}
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              onDismissMobile();
              action.onSelect();
            }}
            data-testid={action.testId}
            className="
            w-full flex items-center gap-2.5 px-2 py-1.5 rounded-md text-left
            text-sm text-[var(--text)]
            hover:bg-[var(--panel-2)]
            focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring-color)]
            transition-colors duration-fast
          "
          >
            <span
              className="inline-flex items-center justify-center w-[22px] h-[22px] rounded-md bg-[var(--panel-2)] text-[var(--text-muted)] shrink-0"
              aria-hidden
            >
              {(() => {
                const Icon = action.icon ?? SettingsIcon;
                return <Icon size={12} strokeWidth={LINE_ICON_STROKE} />;
              })()}
            </span>
            {action.Label ? <action.Label /> : action.label}
          </button>
        ))}
        <button
          type="button"
          role="menuitem"
          onClick={signOut}
          className="
            w-full flex items-center gap-2.5 px-2 py-1.5 rounded-md text-left
            text-sm text-[var(--danger-fg)]
            hover:bg-[var(--danger-bg)]
            focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring-color)]
            transition-colors duration-fast
          "
        >
          <span
            className="inline-flex items-center justify-center w-[22px] h-[22px] rounded-md bg-[var(--danger-bg)] text-[var(--danger-fg)] shrink-0"
            aria-hidden
          >
            <LogOut size={12} strokeWidth={LINE_ICON_STROKE} />
          </span>
          Sign out
        </button>
      </div>
    ) : null;

  if (collapsed) {
    return (
      <div className="relative">
        <button
          ref={triggerRef}
          type="button"
          onClick={() => setOpen(o => !o)}
          aria-label={`${displayName} menu`}
          aria-haspopup="menu"
          aria-expanded={open}
          className={[
            'group relative flex flex-col items-center justify-center gap-0.5 min-w-0 w-full',
            'px-1.5 py-1.5 rounded-[var(--radius-input)]',
            'text-sm transition-colors duration-fast',
            open
              ? 'bg-[var(--nav-active-bg)] text-[var(--nav-active-fg)]'
              : 'text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--panel)]',
          ].join(' ')}
        >
          {user ? (
            <Avatar
              name={user.display_name}
              size="xs"
              ringVariant="none"
              className="shrink-0"
              attachmentId={user.avatar_attachment_id}
              userId={user.id}
              version={user.updated_at}
            />
          ) : (
            <span
              aria-hidden
              className="block w-1.5 h-1.5 rounded-full bg-[var(--text-subtle)] shrink-0 opacity-60"
            />
          )}
          <ChevronsUpDown
            size={10}
            strokeWidth={LINE_ICON_STROKE}
            className="text-[var(--text-subtle)] shrink-0 group-hover:text-[var(--text-muted)]"
            aria-hidden
          />
          <CollapsedTooltip label={displayName} />
        </button>
        {popoverNode ? createPortal(popoverNode, document.body) : null}
      </div>
    );
  }

  return (
    <div className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-label={`${displayName}${user?.email ? ` ${user.email}` : ''} menu`}
        aria-haspopup="menu"
        aria-expanded={open}
        className={[
          'group w-full flex items-center gap-2.5 min-w-0',
          'px-2 py-2 rounded-[var(--radius-input)]',
          'text-left transition-colors duration-fast',
          open
            ? 'bg-[var(--nav-active-bg)]'
            : 'hover:bg-[var(--panel)]',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring-color)]',
        ].join(' ')}
      >
        {user ? (
          <span aria-hidden="true"><Avatar
            name={user.display_name}
            size="sm"
            ringVariant="none"
            className="shrink-0"
            attachmentId={user.avatar_attachment_id}
            userId={user.id}
            version={user.updated_at}
          /></span>
        ) : (
          <span
            aria-hidden
            className="block w-7 h-7 rounded-full bg-[var(--panel-2)] shrink-0"
          />
        )}
        <div className="min-w-0 flex-1 leading-tight">
          <p className="truncate text-sm font-medium text-[var(--text)]">
            {displayName}
          </p>
          {user?.email ? (
            <p className="truncate text-[11px] text-[var(--text-subtle)] mt-0.5">
              {user.email}
            </p>
          ) : null}
        </div>
        <ChevronsUpDown
          size={13}
          strokeWidth={LINE_ICON_STROKE}
          className="text-[var(--text-subtle)] shrink-0 group-hover:text-[var(--text-muted)]"
          aria-hidden
        />
      </button>
      {popoverNode ? createPortal(popoverNode, document.body) : null}
    </div>
  );
}

export function Sidebar({
  collapsed,
  onToggleCollapsed,
  mobileOpen,
  onMobileOpenChange,
  isDesktop,
}: SidebarProps) {
  const railCollapsed = isDesktop && collapsed;
  const { user, logout } = useAuth();
  const { singleUser } = useDeployment();
  const isAdmin = usePlatformAdmin() && !singleUser;
  const navigate = useNavigate();
  const location = useLocation();

  const closeMobile = () => {
    if (!isDesktop) onMobileOpenChange(false);
  };

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const { scope, activeWorkspace } = useScope();
  const { pinned } = usePinned();

  // Cache key includes the active workspace id so a scope switch
  // invalidates the entry. ``/api/tracks`` and ``/api/apps`` are
  // server-side scoped via the X-Integral-Scope header.
  const workspaceId = scope?.workspaceId ?? '__none__';
  const tracksQuery = useQuery({
    queryKey: [...tracksListQueryKey(''), workspaceId] as const,
    queryFn: () => tracksApi.list({ limit: 100 }),
    enabled: pinned.tracks.length > 0,
  });
  const appsQuery = useQuery({
    queryKey: ['apps', 'list', 'sidebar', workspaceId] as const,
    queryFn: () => appsApi.list(),
    enabled: pinned.apps.length > 0,
  });

  const scopedTracks = useMemo<Track[]>(
    () => tracksQuery.data || [],
    [tracksQuery.data]
  );
  const scopedApps = useMemo<App[]>(
    () => appsQuery.data || [],
    [appsQuery.data]
  );

  // Pinned items resolved from the user's pinned-ids set, filtered to the
  // active scope so cross-scope pins don't leak.
  const pinnedTracks = useMemo<Track[]>(() => {
    if (!pinned.tracks.length) return [];
    const byId = new Map(scopedTracks.map(t => [t.id, t] as const));
    return pinned.tracks
      .map(id => byId.get(id))
      .filter((t): t is Track => Boolean(t));
  }, [pinned.tracks, scopedTracks]);

  const pinnedApps = useMemo<App[]>(() => {
    if (!pinned.apps.length) return [];
    const byId = new Map(scopedApps.map(s => [s.id, s] as const));
    return pinned.apps
      .map(id => byId.get(id))
      .filter((s): s is App => Boolean(s));
  }, [pinned.apps, scopedApps]);

  const pinnedEntries = useMemo(
    () => buildPinnedSidebarEntries(
      pinnedApps.map(app => ({ ...app, accent_color: resolveIdentityColor(app.accent_color, activeWorkspace?.accent_color) })),
      pinnedTracks.map(track => ({ ...track, accent_color: resolveIdentityColor(track.accent_color, activeWorkspace?.accent_color) })),
    ),
    [pinnedApps, pinnedTracks, activeWorkspace?.accent_color]
  );

  const collapsibleAppIds = useMemo(
    () => getCollapsiblePinnedAppIds(pinnedEntries),
    [pinnedEntries]
  );

  const {
    isExpanded: isAppExpanded,
    toggle: toggleAppGroup,
    expand: expandAppGroup,
    expandAll: expandAllAppGroups,
    collapseAll: collapseAllAppGroups,
    allCollapsed: allAppGroupsCollapsed,
    showBulkControls: showPinnedBulkControls,
  } = usePinnedSidebarCollapse(workspaceId, collapsibleAppIds);

  // Expand the app group that contains the current route.
  useEffect(() => {
    for (const entry of pinnedEntries) {
      if (entry.kind === 'track') continue;
      const appId = pinnedEntryAppId(entry);
      if (!appId || entry.tracks.length === 0) continue;
      const trackActive = entry.tracks.some(
        t => location.pathname === `/tracks/${t.id}`
      );
      const appActive =
        location.pathname === `/apps/${appId}` ||
        location.pathname.startsWith(`/apps/${appId}/`);
      if (trackActive || appActive) expandAppGroup(appId);
    }
  }, [location.pathname, pinnedEntries, expandAppGroup]);

  const trackTitle = (t: Track) => t.title?.trim() || 'Untitled track';
  const trackSubtitle = (t: Track) => t.app?.name?.trim() || undefined;

  const slideClass =
    mobileOpen || isDesktop ? 'translate-x-0' : '-translate-x-full';
  const widthClass = collapsed ? 'md:w-[60px]' : 'md:w-[264px]';

  return (
    <aside
      id="app-sidebar-nav"
      aria-hidden={!isDesktop && !mobileOpen}
      className={[
        'fixed left-0 z-drawer md:z-rail',
        'sidebar-shell flex flex-col',
        railCollapsed ? 'px-2.5' : 'px-[22px]',
        // Portaled menus and tooltips can extend past the rail; horizontal-overflow
        // never appears in collapsed mode because all labels are hidden.
        // Owns transitions for width, transform, padding, top, and
        // height. Top/height share the layout's slower easing so the
        // sidebar squeezes in lockstep with main content when the
        // system bar mounts/unmounts.
        'system-bar-sidebar',
        'w-[min(280px,88vw)]',
        widthClass,
        slideClass,
        'md:translate-x-0',
        'bg-[var(--section-bg)] text-[var(--text)]',
        'border-r border-[var(--panel-border)]',
        'max-md:shadow-2xl md:shadow-none',
        !isDesktop && !mobileOpen ? 'pointer-events-none' : '',
      ].join(' ')}
      style={{
        top: 'var(--system-bar-h, 0px)',
        height: 'calc(100dvh - var(--system-bar-h, 0px))',
      }}
    >
      {/* Header — Logo primitive (mark + wordmark). Generous bottom
          margin so the brand sits as its own beat above the nav. */}
      <div
        className={[
          'sidebar-brand flex shrink-0 items-center gap-2 min-h-[24px]',
          railCollapsed ? 'justify-center' : 'justify-between',
        ].join(' ')}
      >
        <Logo to="/" size="md" markOnly={railCollapsed} />
        {/* Mobile drawer close — only on small viewports. */}
        {!isDesktop ? (
          <button
            type="button"
            onClick={() => onMobileOpenChange(false)}
            aria-label="Close menu"
            className="md:hidden inline-flex items-center justify-center w-8 h-8 rounded-md text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--panel-2)] transition-colors duration-fast"
          >
            <X size={16} strokeWidth={LINE_ICON_STROKE} />
          </button>
        ) : null}
        {/* Desktop collapse toggle — chevron rotates 180° in collapsed state.
            Hidden on mobile (the drawer pattern owns open/close there). */}
        {isDesktop && !railCollapsed ? (
          <button
            type="button"
            onClick={onToggleCollapsed}
            aria-label="Collapse sidebar"
            className="hidden md:inline-flex items-center justify-center w-7 h-7 rounded-md text-[var(--text-subtle)] hover:text-[var(--text)] hover:bg-[var(--panel)] transition-colors duration-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring-color)]"
          >
            <ChevronLeft size={14} strokeWidth={LINE_ICON_STROKE} />
          </button>
        ) : null}
      </div>

      {/* Collapsed-state expand button — pinned below the logo when the rail
          is collapsed. Sized to the rail width so it's still tappable. */}
      {railCollapsed ? (
        <button
          type="button"
          onClick={onToggleCollapsed}
          aria-label="Expand sidebar"
          className="mb-4 mx-auto inline-flex items-center justify-center w-8 h-8 rounded-md text-[var(--text-subtle)] hover:text-[var(--text)] hover:bg-[var(--panel)] transition-colors duration-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring-color)]"
        >
          <ChevronLeft size={14} strokeWidth={LINE_ICON_STROKE} className="rotate-180" />
        </button>
      ) : null}

      {/* Sections — overflow-y-auto in expanded mode lets long Track/App
          lists scroll. Native scrollbar is hidden; affordance is provided
          by SidebarScroller (edge fade + chevron). In collapsed (rail)
          mode we drop scroll entirely so the absolute-positioned hover
          tooltips can extend past the rail's right edge. */}
      <SidebarScroller
        disabled={railCollapsed}
        contentSignal={`${pinnedEntries.length}:${pinnedTracks.length}:${pinnedApps.length}`}
        className={railCollapsed ? 'sidebar-rail-scroll' : ''}
      >
      <nav
        aria-label="Sidebar navigation"
        className={[
          'flex flex-col gap-6 px-1 pb-2',
          railCollapsed ? 'overflow-visible flex-1 min-h-0' : '',
        ].join(' ')}
      >
        {/* HOME */}
        <div className="flex flex-col gap-0.5">
          <NavItem
            to="/"
            label="Home"
            end
            onClick={closeMobile}
            collapsed={railCollapsed}
            leading={<HomeIcon size={15} strokeWidth={LINE_ICON_STROKE} className="shrink-0" aria-hidden />}
          />
        </div>

        {/* Divider */}
        {railCollapsed ? null : (
          <div aria-hidden className="-my-3 mx-2 border-t border-[var(--border-subtle)]" />
        )}

        {/* WORKSPACE */}
        <div>
          {railCollapsed ? null : <SectionEyebrow>Workspace</SectionEyebrow>}
          <div className="flex flex-col gap-1">
            <WorkspaceSwitcher collapsed={railCollapsed} />
            <div className="flex flex-col gap-0.5">
              <NavItem
                to="/agent"
                label="Agent"
                tooltip="Agent — talk to your Integral coworker"
                onClick={closeMobile}
                collapsed={railCollapsed}
                leading={<MessageSquare size={15} strokeWidth={LINE_ICON_STROKE} className="shrink-0" aria-hidden />}
              />
              <NavItem
                to="/feed"
                label="Feed"
                onClick={closeMobile}
                collapsed={railCollapsed}
                leading={<Rss size={15} strokeWidth={LINE_ICON_STROKE} className="shrink-0" aria-hidden />}
              />
              <NavItem
                to="/apps"
                label="Apps"
                onClick={closeMobile}
                collapsed={railCollapsed}
                leading={<LayoutGrid size={15} strokeWidth={LINE_ICON_STROKE} className="shrink-0" aria-hidden />}
              />
              <NavItem
                to="/tracks"
                label="Tracks"
                onClick={closeMobile}
                collapsed={railCollapsed}
                leading={<ListIcon size={15} strokeWidth={LINE_ICON_STROKE} className="shrink-0" aria-hidden />}
              />
            </div>
          </div>
        </div>

        {/* Divider */}
        {railCollapsed ? null : (
          <div aria-hidden className="-my-3 mx-2 border-t border-[var(--border-subtle)]" />
        )}

        {/* PINNED — always present in expanded mode (hint when empty);
            hidden in rail-collapsed mode unless populated. */}
        {(pinnedTracks.length > 0 || pinnedApps.length > 0 || !railCollapsed) && (
          <div>
            {railCollapsed ? null : (
              <PinnedSectionHeader
                showBulkControls={showPinnedBulkControls}
                allCollapsed={allAppGroupsCollapsed}
                onToggleAll={() =>
                  allAppGroupsCollapsed
                    ? expandAllAppGroups()
                    : collapseAllAppGroups()
                }
              />
            )}
            {pinnedTracks.length === 0 && pinnedApps.length === 0 && !railCollapsed ? (
              <div className="mx-2 flex items-center gap-1.5 text-[11px] text-[var(--text-subtle)] opacity-60 select-none pointer-events-none">
                <Pin size={11} strokeWidth={LINE_ICON_STROKE} aria-hidden className="shrink-0" />
                <span className="italic leading-snug">Pin tracks &amp; apps for quick access</span>
              </div>
            ) : null}
            <div className="flex flex-col gap-0.5">
              {railCollapsed ? (
                <>
                  {pinnedApps.map(s => (
                    <NavItem
                      key={s.id}
                      to={`/apps/${s.id}`}
                      label={s.name?.trim() || 'Untitled app'}
                      onClick={closeMobile}
                      collapsed
                      leading={
                        <AppIcon name={s.name} icon={s.icon} color={resolveIdentityColor(s.accent_color, activeWorkspace?.accent_color)} size="xs" />
                      }
                      trailing={
                        <PinButton
                          kind="app"
                          id={s.id}
                          label={s.name?.trim() || 'app'}
                          size="sm"
                        />
                      }
                    />
                  ))}
                  {pinnedTracks.map(t => (
                    <NavItem
                      key={t.id}
                      to={`/tracks/${t.id}`}
                      label={trackTitle(t)}
                      onClick={closeMobile}
                      collapsed
                      tooltip={
                        trackSubtitle(t)
                          ? `${trackTitle(t)} — ${trackSubtitle(t)}`
                          : trackTitle(t)
                      }
                      leading={
            <TrackAccentDot title={t.title} accentColor={resolveIdentityColor(t.accent_color, activeWorkspace?.accent_color)} />
                      }
                      trailing={
                        <PinButton
                          kind="track"
                          id={t.id}
                          label={t.title?.trim() || 'track'}
                          size="sm"
                        />
                      }
                    />
                  ))}
                </>
              ) : (
                pinnedEntries.map(entry =>
                  renderPinnedEntry(entry, {
                    railCollapsed,
                    closeMobile,
                    trackTitle,
                    trackSubtitle,
                    isAppExpanded,
                    toggleAppGroup,
                  })
                )
              )}
            </div>
          </div>
        )}

      </nav>

      {/* Secondary nav — Approvals + Notifications + Settings. Inconspicuous,
          sits just above the user/footer separator. No active inversion;
          muted hover only. Approvals shares the bell-adjacent surface because
          both are "queue waiting for me" inboxes (the TopBar bell modal also
          exposes Approvals as a tab). */}
      <div className={`px-1 pb-1 ${railCollapsed ? 'pt-2' : 'pt-2'}`}>
        <div className="flex flex-col gap-0.5">
          {isAdmin && (
            <SecondaryNavItem
              to="/admin"
              label="Admin"
              icon={<Shield size={13} strokeWidth={LINE_ICON_STROKE} />}
              collapsed={railCollapsed}
              onClick={closeMobile}
            />
          )}
          <SecondaryNavItem
            to="/approvals"
            label="Approvals"
            icon={<ShieldCheck size={13} strokeWidth={LINE_ICON_STROKE} />}
            collapsed={railCollapsed}
            onClick={closeMobile}
          />
          <SecondaryNavItem
            to="/background-tasks"
            label="Background Tasks"
            icon={<ListTodo size={13} strokeWidth={LINE_ICON_STROKE} />}
            collapsed={railCollapsed}
            onClick={closeMobile}
          />
          <SecondaryNavItem
            to="/notifications"
            label="Notifications"
            icon={<Bell size={13} strokeWidth={LINE_ICON_STROKE} />}
            collapsed={railCollapsed}
            onClick={closeMobile}
          />
          <SecondaryNavItem
            to="/settings"
            label="Settings"
            icon={<SettingsIcon size={13} strokeWidth={LINE_ICON_STROKE} />}
            collapsed={railCollapsed}
            onClick={closeMobile}
          />
        </div>
      </div>

      </SidebarScroller>

      {/* Footer — account menu. Theme toggle lives in TopBar. */}
      <div className="shrink-0 px-1 pt-3 mt-3 border-t border-[var(--border-subtle)]">
        <SidebarAccountMenu
          user={user}
          collapsed={railCollapsed}
          onLogout={handleLogout}
          onDismissMobile={closeMobile}
        />
      </div>
    </aside>
  );
}
