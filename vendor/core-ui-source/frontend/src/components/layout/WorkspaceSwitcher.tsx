/**
 * WorkspaceSwitcher — top-of-sidebar scope selector.
 *
 * Renders the currently-active scope and, on click, opens a popover listing
 * every accessible workspace with an ownership/access label per row.
 * Collapsed-rail mode shows only the accent dot.
 *
 * Pattern reference: Slack workspace rail, Linear team switcher,
 * Notion workspace picker.
 */

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { ChevronsUpDown, Check, Plus, ListOrdered, Loader2 } from 'lucide-react';
import { Avatar, LINE_ICON_STROKE } from '../ui';
import { CreateWorkspaceModal } from '../workspace/CreateWorkspaceModal';
import { useWorkspacesWithRunningTurns } from '../../features/ai-chat';
import { useScope, type Scope } from '../../context/ScopeContext';
import { invalidateWorkspaceListCaches } from '../../queryKeys';
import {
  isOwnedPersonalWorkspace,
  type Workspace,
  workspaceAccessLabel,
} from '../../api/workspaces';

// Workspace icons represent each workspace's own identity. The immutable
// default tokens preserve the stock theme colors while --brand-accent may be
// overridden by the active workspace.
const DEFAULT_WORKSPACE_ACCENT = 'var(--brand-accent-default)';
const DEFAULT_WORKSPACE_ACCENT_CONTRAST = 'var(--brand-accent-default-contrast)';

function workspaceAccentTextColor(color: string): string {
  const raw = color.trim().replace(/^#/, '');
  const digits = raw.length === 3
    ? raw.split('').map((char) => `${char}${char}`).join('')
    : raw;
  if (!/^[0-9a-f]{6}$/i.test(digits)) return '#ffffff';
  const red = parseInt(digits.slice(0, 2), 16);
  const green = parseInt(digits.slice(2, 4), 16);
  const blue = parseInt(digits.slice(4, 6), 16);
  const luminance = (red * 299 + green * 587 + blue * 114) / 1000;
  return luminance >= 150 ? '#1a1a1a' : '#ffffff';
}

/** Switcher subtext reflects this viewer's access, not only workspace kind. */
function workspaceSublabel(workspace: Workspace): string {
  return workspaceAccessLabel(workspace);
}

/** Workspace icon — uses an uploaded ``avatar_url`` when set, falling
 *  back to the colored-initials Avatar primitive shared with member
 *  rows. Same visual language for every workspace kind (Personal +
 *  Organization), so the switcher feels like a consistent surface.
 */
function WorkspaceAvatar({
  name,
  url,
  accentColor,
  collapsed
}: {
  name: string;
  url?: string;
  accentColor?: string | null;
  collapsed?: boolean;
}) {
  const configuredAccent = accentColor?.trim();
  const identityColor = configuredAccent || DEFAULT_WORKSPACE_ACCENT;
  return (
    <Avatar
      name={name || 'Workspace'}
      url={url || undefined}
      size={collapsed ? 'sm' : 'sm'}
      ringVariant="none"
      accentColor={identityColor}
      accentTextColor={configuredAccent
        ? workspaceAccentTextColor(configuredAccent)
        : DEFAULT_WORKSPACE_ACCENT_CONTRAST}
      className="shrink-0"
    />
  );
}

interface Props {
  /** Sidebar rail mode — collapsed shows only the avatar with a hover
   *  tooltip; expanded shows the full row with name + chevron. Defaults
   *  to `false` so component is renderable standalone (e.g. in tests). */
  collapsed?: boolean;
}

export function WorkspaceSwitcher({ collapsed = false }: Props) {
  const { scope, workspaces, activeWorkspace, setScope } = useScope();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const [popoverPos, setPopoverPos] = useState<{
    top: number;
    left: number;
    width: number;
  } | null>(null);

  // Recompute popover position whenever it opens or window resizes.
  useLayoutEffect(() => {
    if (!open || !triggerRef.current) return;
    const compute = () => {
      const rect = triggerRef.current!.getBoundingClientRect();
      setPopoverPos({
        top: rect.bottom + 6,
        left: rect.left,
        width: Math.max(260, rect.width)
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

  const triggerLabel = activeWorkspace?.name?.trim() || 'Workspace';
  const triggerAvatarUrl = activeWorkspace?.avatar_url;
  const triggerAccentColor = activeWorkspace?.accent_color;

  /**
   * A turn running in a workspace the user is NOT currently looking at.
   *
   * Deliberately excludes the active workspace: its progress is already
   * visible in the chat surface and the thread row, so repeating it on the
   * trigger would be noise. The signal worth carrying up here is the one
   * nothing else on screen can give — work continuing somewhere the user
   * navigated away from.
   */
  const busyWorkspaceIds = useWorkspacesWithRunningTurns();
  const busyElsewhere = [...busyWorkspaceIds].some(
    id => id !== scope?.workspaceId,
  );

  // Routes whose contents are scope-bound — viewing one of these after a
  // scope switch would leave the user staring at out-of-scope content.
  // Switching scope routes them to a safe, cross-scope landing.
  const isScopedDetailRoute = (path: string): boolean => {
    return (
      /^\/tracks\/[^/]+/.test(path) ||
      /^\/apps\/[^/]+/.test(path) ||
      /^\/spaces\/[^/]+/.test(path) ||
      /^\/workspaces\/[^/]+/.test(path)
    );
  };

  const choose = (next: Scope) => {
    const sameScope = scope?.workspaceId === next.workspaceId;
    setScope(next);
    setOpen(false);
    if (sameScope) return;
    if (isScopedDetailRoute(location.pathname)) {
      navigate(`/workspaces/${next.workspaceId}`);
    }
  };

  const openCreateModal = () => {
    setOpen(false);
    setCreateOpen(true);
  };

  const popoverNode = open && popoverPos ? (
    <SwitcherPopover
      innerRef={popoverRef}
      style={{
        position: 'fixed',
        top: popoverPos.top,
        left: popoverPos.left,
        width: popoverPos.width
      }}
      scope={scope}
      workspaces={workspaces}
      onChoose={choose}
      onDismiss={() => setOpen(false)}
      onCreateWorkspace={openCreateModal}
    />
  ) : null;

  const createModal = (
    <CreateWorkspaceModal
      open={createOpen}
      onClose={() => setCreateOpen(false)}
      onCreated={async (created) => {
        qc.setQueryData<Workspace[]>(['workspaces'], old => {
          const list = old ?? [];
          return list.some(w => w.id === created.id)
            ? list
            : [...list, { ...created, your_role: created.your_role ?? 'owner' }];
        });
        void invalidateWorkspaceListCaches(qc);
        setScope({ workspaceId: created.id });
        navigate(`/workspaces/${created.id}`);
      }}
    />
  );

  if (collapsed) {
    return (
      <div className="relative">
        <button
          ref={triggerRef}
          type="button"
          onClick={() => setOpen(o => !o)}
          aria-label={`Switch workspace (currently ${triggerLabel})`}
          aria-haspopup="listbox"
          aria-expanded={open}
          className="
            group relative mx-auto inline-flex items-center justify-center
            w-9 h-9 rounded-md
            hover:bg-[var(--panel)]
            focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring-color)]
            transition-colors duration-fast
          "
        >
          <WorkspaceAvatar name={triggerLabel} url={triggerAvatarUrl} accentColor={triggerAccentColor} collapsed />
          {busyElsewhere ? (
            <Loader2
              size={11}
              strokeWidth={LINE_ICON_STROKE}
              className="absolute -top-0.5 -right-0.5 animate-spin text-[var(--text-subtle)]"
              aria-label="An agent is working in another workspace"
            />
          ) : null}
          <span
            aria-hidden
            className="
              pointer-events-none absolute left-full top-1/2 -translate-y-1/2 ml-3
              px-2.5 py-1.5 rounded-md
              bg-[var(--text)] text-[var(--bg)]
              shadow-[var(--shadow-pop)]
              text-xs font-medium whitespace-nowrap
              opacity-0 group-hover:opacity-100 group-focus-within:opacity-100
              transition-opacity duration-fast
              z-50
            "
          >
            {triggerLabel}
          </span>
        </button>
        {popoverNode ? createPortal(popoverNode, document.body) : null}
        {createModal}
      </div>
    );
  }

  return (
    <div className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-label={`Switch workspace (currently ${triggerLabel})`}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={[
          'group w-full flex items-center gap-2 px-2 py-[7px] rounded-[8px]',
          'text-left text-sm text-[var(--text-muted)]',
          'hover:text-[var(--text)] hover:bg-[var(--panel)]',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring-color)]',
          'transition-colors duration-fast',
          open ? 'bg-[var(--panel)] text-[var(--text)]' : '',
        ].join(' ')}
      >
        <span aria-hidden="true"><WorkspaceAvatar name={triggerLabel} url={triggerAvatarUrl} accentColor={triggerAccentColor} /></span>
        <span className="flex-1 min-w-0 truncate font-medium">{triggerLabel}</span>
        {busyElsewhere ? (
          <Loader2
            size={12}
            strokeWidth={LINE_ICON_STROKE}
            className="animate-spin text-[var(--text-subtle)] shrink-0"
            aria-label="An agent is working in another workspace"
          />
        ) : null}
        <ChevronsUpDown
          size={13}
          strokeWidth={LINE_ICON_STROKE}
          className="text-[var(--text-subtle)] shrink-0 group-hover:text-[var(--text-muted)]"
        />
      </button>
      {popoverNode ? createPortal(popoverNode, document.body) : null}
      {createModal}
    </div>
  );
}

function SwitcherPopover({
  innerRef,
  style,
  scope,
  workspaces,
  onChoose,
  onDismiss,
  onCreateWorkspace
}: {
  // See the note on EntryFormExpanded.titleInputRef: RefObject<T> is already
  // nullable in `current`, and the caller passes useRef<HTMLDivElement>(null).
  innerRef: React.RefObject<HTMLDivElement>;
  style: React.CSSProperties;
  scope: Scope | null;
  workspaces: Workspace[];
  onChoose: (next: Scope) => void;
  onDismiss: () => void;
  onCreateWorkspace: () => void;
}) {
  const busyWorkspaceIds = useWorkspacesWithRunningTurns();
  // Personal workspaces float to the top of the list; organization
  // workspaces follow in their natural order.
  const sorted = [...workspaces].sort((a, b) => {
    if (a.kind === b.kind) return 0;
    return a.kind === 'personal' ? -1 : 1;
  });
  return (
    <div
      ref={innerRef}
      role="listbox"
      aria-label="Workspaces"
      style={style}
      className="
        z-popover
        rounded-lg border border-[var(--panel-border)] bg-[var(--panel)]
        shadow-[var(--shadow-pop)] p-1
        max-h-[60vh] overflow-y-auto
      "
    >
      {sorted.map(ws => {
        const isOwnedPersonal = isOwnedPersonalWorkspace(ws);
        return (
          <SwitcherRow
            key={ws.id}
            active={scope?.workspaceId === ws.id}
            busy={busyWorkspaceIds.has(ws.id)}
            label={ws.name?.trim() || (isOwnedPersonal ? 'Personal' : 'Workspace')}
            sublabel={workspaceSublabel(ws)}
            avatarUrl={ws.avatar_url}
            accentColor={ws.accent_color}
            onClick={() => onChoose({ workspaceId: ws.id })}
          />
        );
      })}
      <div className="my-1 border-t border-[var(--panel-border)]" aria-hidden />
      {/* Footer actions — discoverable inside the switcher so the WORKSPACE
          section can drop the dedicated "Workspaces" item. */}
      <button
        type="button"
        onClick={() => {
          onDismiss();
          onCreateWorkspace();
        }}
        className="
          w-full flex items-center gap-2.5 px-2 py-1.5 rounded-md text-left
          text-sm font-medium text-[var(--text)]
          hover:bg-[var(--panel-2)]
          focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring-color)]
          transition-colors duration-fast
        "
      >
        <span
          className="inline-flex items-center justify-center w-[22px] h-[22px] rounded-md bg-[var(--panel-2)] text-[var(--text-muted)] shrink-0"
          aria-hidden
        >
          <Plus size={12} strokeWidth={LINE_ICON_STROKE} />
        </span>
        New workspace
      </button>
      <Link
        to="/workspaces"
        onClick={onDismiss}
        className="
          w-full flex items-center gap-2.5 px-2 py-1.5 rounded-md text-left
          text-sm text-[var(--text-muted)]
          hover:bg-[var(--panel-2)] hover:text-[var(--text)]
          focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring-color)]
          transition-colors duration-fast
        "
      >
        <span
          className="inline-flex items-center justify-center w-[22px] h-[22px] rounded-md bg-[var(--panel-2)] text-[var(--text-muted)] shrink-0"
          aria-hidden
        >
          <ListOrdered size={12} strokeWidth={LINE_ICON_STROKE} />
        </span>
        View all workspaces
      </Link>
    </div>
  );
}

function SwitcherRow({
  active,
  busy,
  label,
  sublabel,
  avatarUrl,
  accentColor,
  onClick
}: {
  active: boolean;
  busy?: boolean;
  label: string;
  sublabel: React.ReactNode;
  avatarUrl?: string;
  accentColor?: string | null;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="option"
      aria-selected={active}
      onClick={onClick}
      className={[
        'w-full flex items-center gap-2.5 px-2 py-1.5 rounded-md text-left',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring-color)]',
        'transition-colors duration-fast',
        active
          ? 'bg-[var(--nav-active-bg)] text-[var(--nav-active-fg)]'
          : 'hover:bg-[var(--panel-2)] text-[var(--text)]',
      ].join(' ')}
    >
      <WorkspaceAvatar name={label} url={avatarUrl} accentColor={accentColor} />
      <span className="flex-1 min-w-0">
        <span className="block truncate text-sm font-medium">{label}</span>
        <span className="block text-xs text-[var(--text-muted)] truncate">
          {sublabel}
        </span>
      </span>
      {busy ? (
        <Loader2
          size={13}
          strokeWidth={LINE_ICON_STROKE}
          className="animate-spin text-[var(--text-subtle)] shrink-0"
          aria-label="Agent is working in this workspace"
        />
      ) : null}
      {active ? (
        <Check
          size={14}
          strokeWidth={LINE_ICON_STROKE}
          className="text-[var(--text)] shrink-0"
          aria-hidden
        />
      ) : null}
    </button>
  );
}
