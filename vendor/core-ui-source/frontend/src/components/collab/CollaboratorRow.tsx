import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown, Crown, UserMinus, Ban, Undo2 } from 'lucide-react';
import { AvatarStackedMeta } from '../ui/AvatarStackedMeta';
import { LINE_ICON_STROKE } from '../ui/IconWell';

export type CollaboratorRole = 'owner' | 'admin' | 'editor' | 'commenter' | 'viewer';

interface RoleOption {
  value: CollaboratorRole;
  label: string;
  description: string;
}

const DEFAULT_ROLE_OPTIONS: RoleOption[] = [
  { value: 'admin', label: 'Admin', description: 'Manage settings and configuration' },
  { value: 'editor', label: 'Editor', description: 'Create and edit entries' },
  { value: 'commenter', label: 'Commenter', description: 'Read and comment only' },
  { value: 'viewer', label: 'Viewer', description: 'Read only' },
];

const ROLE_LABEL: Record<string, string> = {
  owner: 'Owner',
  admin: 'Admin',
  editor: 'Editor',
  commenter: 'Commenter',
  viewer: 'Viewer',
};

export interface CollaboratorRowProps {
  avatar: ReactNode;
  name: ReactNode;
  meta?: ReactNode;
  badges?: ReactNode;
  role: string;
  /** Optional display-only role label override (e.g. uncapped parent
   *  role on inherited rows). Effective ``role`` still drives semantics
   *  like the role-menu checkmark, but the trigger / static pill shows
   *  ``displayRole``. Use to surface "Owner via App" lineage without
   *  altering I-ROLE-02 cap semantics. */
  displayRole?: string;
  excluded?: boolean;
  /** Suppress all action affordances (viewer or self row). */
  readOnly?: boolean;
  onChangeRole?: (role: CollaboratorRole) => void;
  onTransferOwnership?: () => void;
  onRemove?: () => void;
  removeLabel?: string;
  onExclude?: () => void;
  onRestore?: () => void;
  roleOptions?: RoleOption[];
}

export function CollaboratorRow({
  avatar,
  name,
  meta,
  badges,
  role,
  displayRole,
  excluded,
  readOnly,
  onChangeRole,
  onTransferOwnership,
  onRemove,
  removeLabel = 'Remove',
  onExclude,
  onRestore,
  roleOptions = DEFAULT_ROLE_OPTIONS,
}: CollaboratorRowProps) {
  const roleLower = (role || '').toLowerCase();
  const displayLower = (displayRole || role || '').toLowerCase();
  const isOwnerRow = displayLower === 'owner';
  const roleLabel = ROLE_LABEL[displayLower] ?? displayRole ?? role ?? '—';

  const hasActions =
    !readOnly &&
    (Boolean(onChangeRole) ||
      Boolean(onTransferOwnership) ||
      Boolean(onRemove) ||
      Boolean(onExclude) ||
      Boolean(onRestore));

  return (
    <li
      className={[
        'flex items-center gap-3 rounded-[var(--radius-input)] border px-3 py-2.5 text-sm transition-colors',
        excluded
          ? 'border-[color:var(--danger-fg)]/30 bg-[var(--danger-bg)]/30'
          : 'border-[var(--panel-border)] bg-[var(--panel-2)]/40 hover:bg-[var(--panel-2)]/70',
      ].join(' ')}
    >
      <AvatarStackedMeta
        className="min-w-0 flex-1"
        avatar={avatar}
        primary={
          <span className="flex min-w-0 items-center gap-2">
            <span
              className={[
                'truncate font-medium',
                excluded ? 'text-[var(--text-muted)]' : 'text-[var(--text)]',
              ].join(' ')}
            >
              {name}
            </span>
            {badges}
          </span>
        }
        secondary={
          meta ? (
            <span className="truncate text-xs text-[var(--text-muted)]">{meta}</span>
          ) : undefined
        }
      />
      <div className="shrink-0">
        {hasActions ? (
          <RoleMenu
            roleLabel={roleLabel}
            roleLower={roleLower}
            isOwnerRow={isOwnerRow}
            excluded={excluded}
            roleOptions={roleOptions}
            onChangeRole={onChangeRole}
            onTransferOwnership={onTransferOwnership}
            onRemove={onRemove}
            removeLabel={removeLabel}
            onExclude={onExclude}
            onRestore={onRestore}
          />
        ) : (
          <span className="inline-flex items-center gap-1 rounded-md border border-[var(--panel-border)] bg-[var(--panel-2)] px-2.5 py-1 text-xs font-medium uppercase tracking-wide text-[var(--text-muted)]">
            {isOwnerRow ? (
              <Crown size={12} strokeWidth={LINE_ICON_STROKE} aria-hidden />
            ) : null}
            {roleLabel}
          </span>
        )}
      </div>
    </li>
  );
}

interface RoleMenuProps {
  roleLabel: string;
  roleLower: string;
  isOwnerRow: boolean;
  excluded?: boolean;
  roleOptions: RoleOption[];
  onChangeRole?: (role: CollaboratorRole) => void;
  onTransferOwnership?: () => void;
  onRemove?: () => void;
  removeLabel: string;
  onExclude?: () => void;
  onRestore?: () => void;
}

function RoleMenu({
  roleLabel,
  roleLower,
  isOwnerRow,
  excluded,
  roleOptions,
  onChangeRole,
  onTransferOwnership,
  onRemove,
  removeLabel,
  onExclude,
  onRestore,
}: RoleMenuProps) {
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<{
    top: number;
    left: number;
    minWidth: number;
    maxH: number;
  } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  const updateCoords = useCallback(() => {
    const el = triggerRef.current;
    if (!el || typeof window === 'undefined') return;
    const r = el.getBoundingClientRect();
    const pad = 8;
    const maxH = Math.max(180, Math.min(360, window.innerHeight - r.bottom - pad));
    setCoords({
      top: r.bottom + 4,
      left: r.left,
      minWidth: Math.max(r.width, 240),
      maxH,
    });
  }, []);

  useLayoutEffect(() => {
    if (!open) {
      setCoords(null);
      return;
    }
    updateCoords();
    window.addEventListener('scroll', updateCoords, true);
    window.addEventListener('resize', updateCoords);
    return () => {
      window.removeEventListener('scroll', updateCoords, true);
      window.removeEventListener('resize', updateCoords);
    };
  }, [open, updateCoords]);

  useLayoutEffect(() => {
    if (!open || !coords) return;
    const el = menuRef.current;
    if (!el) return;
    const pad = 8;
    const rect = el.getBoundingClientRect();
    let left = coords.left;
    if (rect.right > window.innerWidth - pad) {
      left = Math.max(pad, window.innerWidth - pad - rect.width);
    }
    if (left < pad) left = pad;
    if (Math.abs(left - coords.left) > 0.5) {
      setCoords(c => (c ? { ...c, left } : null));
    }
  }, [open, coords]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    const onPointer = (e: PointerEvent) => {
      const t = e.target as Node;
      if (triggerRef.current?.contains(t) || menuRef.current?.contains(t)) return;
      setOpen(false);
    };
    window.addEventListener('keydown', onKey, true);
    document.addEventListener('pointerdown', onPointer);
    return () => {
      window.removeEventListener('keydown', onKey, true);
      document.removeEventListener('pointerdown', onPointer);
    };
  }, [open]);

  const handleSelectRole = (next: CollaboratorRole) => {
    setOpen(false);
    if (next === roleLower) return;
    onChangeRole?.(next);
  };

  const triggerLabel = excluded ? 'Excluded' : roleLabel;

  const menu = open && coords && (
    <div
      ref={menuRef}
      id={menuId}
      role="menu"
      className="fixed z-popover overflow-y-auto rounded-[var(--radius-card)] border border-[var(--panel-border)] bg-[var(--panel)] py-1 shadow-[var(--shadow-pop)]"
      style={{
        top: coords.top,
        left: coords.left,
        minWidth: coords.minWidth,
        maxHeight: coords.maxH,
      }}
      onClick={e => e.stopPropagation()}
    >
      {onChangeRole && !excluded ? (
        <>
          <div className="px-3 pt-2 pb-1 text-[11px] font-semibold uppercase tracking-[0.1em] text-[var(--text-muted)]">
            Role
          </div>
          {roleOptions.map(opt => {
            const isSelected = opt.value === roleLower;
            return (
              <button
                key={opt.value}
                type="button"
                role="menuitemradio"
                aria-checked={isSelected}
                onClick={() => handleSelectRole(opt.value)}
                className={[
                  'flex w-full items-start gap-2 px-3 py-2 text-left text-sm',
                  isSelected
                    ? 'bg-[var(--nav-active-bg)] text-[var(--nav-active-fg)]'
                    : 'text-[var(--text)] hover:bg-[var(--panel-2)]',
                ].join(' ')}
              >
                <span className="mt-0.5 inline-flex h-4 w-4 shrink-0 items-center justify-center">
                  {isSelected ? (
                    <Check size={14} strokeWidth={LINE_ICON_STROKE} aria-hidden />
                  ) : null}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-medium">{opt.label}</span>
                  <span
                    className={[
                      'block text-xs',
                      isSelected ? 'opacity-80' : 'text-[var(--text-muted)]',
                    ].join(' ')}
                  >
                    {opt.description}
                  </span>
                </span>
              </button>
            );
          })}
        </>
      ) : null}

      {onTransferOwnership && !isOwnerRow && !excluded ? (
        <>
          <div className="my-1 h-px bg-[var(--panel-border)]" aria-hidden />
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              onTransferOwnership();
            }}
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-[var(--text)] hover:bg-[var(--panel-2)]"
          >
            <Crown size={14} strokeWidth={LINE_ICON_STROKE} aria-hidden />
            <span>Transfer ownership</span>
          </button>
        </>
      ) : null}

      {(onExclude && !excluded) || onRestore || onRemove ? (
        <>
          <div className="my-1 h-px bg-[var(--panel-border)]" aria-hidden />
          {onRestore ? (
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                onRestore();
              }}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-[var(--text)] hover:bg-[var(--panel-2)]"
            >
              <Undo2 size={14} strokeWidth={LINE_ICON_STROKE} aria-hidden />
              <span>Restore access</span>
            </button>
          ) : null}
          {onExclude && !excluded ? (
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                onExclude();
              }}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-[var(--danger-fg)] hover:bg-[var(--danger-bg)]"
            >
              <Ban size={14} strokeWidth={LINE_ICON_STROKE} aria-hidden />
              <span>Exclude from this</span>
            </button>
          ) : null}
          {onRemove ? (
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                onRemove();
              }}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-[var(--danger-fg)] hover:bg-[var(--danger-bg)]"
            >
              <UserMinus size={14} strokeWidth={LINE_ICON_STROKE} aria-hidden />
              <span>{removeLabel}</span>
            </button>
          ) : null}
        </>
      ) : null}
    </div>
  );

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => setOpen(o => !o)}
        className={[
          'inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium transition-colors',
          excluded
            ? 'border-[color:var(--danger-fg)]/30 bg-[var(--danger-bg)]/40 text-[var(--danger-fg)] hover:bg-[var(--danger-bg)]'
            : 'border-[var(--panel-border)] bg-[var(--panel-2)] text-[var(--text)] hover:bg-[var(--panel-2)]/80',
        ].join(' ')}
      >
        {isOwnerRow && !excluded ? (
          <Crown size={12} strokeWidth={LINE_ICON_STROKE} aria-hidden />
        ) : null}
        <span>{triggerLabel}</span>
        <ChevronDown
          size={14}
          strokeWidth={LINE_ICON_STROKE}
          className={`text-[var(--text-muted)] transition-transform ${open ? 'rotate-180' : ''}`}
          aria-hidden
        />
      </button>
      {menu ? createPortal(menu, document.body) : null}
    </>
  );
}
