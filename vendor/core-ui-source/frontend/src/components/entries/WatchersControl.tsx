import { Text, Surface } from '../../ui';
import { useState, useRef, useEffect } from 'react';
import { Bell, BellOff, Users } from 'lucide-react';
import { Avatar, LINE_ICON_STROKE } from '../ui';

interface WatcherUser {
  id: string;
  display_name?: string;
  email?: string;
  avatar_url?: string;
  avatar_attachment_id?: string;
  updated_at?: string;
}

interface WatchersControlProps {
  entryId?: string;
  watchers: WatcherUser[];
  isWatching: boolean;
  onToggle(): void;
  scope?: 'entry' | 'track';
  /** Show a readable subscription label instead of an icon and bare count. */
  showLabel?: boolean;
}

export function WatchersControl({
  watchers,
  isWatching,
  onToggle,
  scope = 'entry',
  showLabel = false,
}: WatchersControlProps) {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      const t = e.target as HTMLElement | null;
      if (!t || !wrapperRef.current?.contains(t)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopImmediatePropagation();
        setOpen(false);
        wrapperRef.current?.querySelector<HTMLButtonElement>('button')?.focus();
      }
    };
    document.addEventListener('pointerdown', onPointer);
    window.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      window.removeEventListener('keydown', onKey, true);
    };
  }, [open]);

  return (
    <div className="relative inline-block" ref={wrapperRef}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className={`
          inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium border
          transition-colors duration-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring-color)]
          ${isWatching
            ? 'bg-[var(--brand-accent)]/15 text-[var(--brand-accent)] border-[var(--brand-accent)]/30 hover:bg-[var(--brand-accent)]/25'
            : 'border-transparent hover:opacity-80'
          }
        `}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Manage watchers"
      >
        {isWatching ? (
          <Bell size={14} strokeWidth={LINE_ICON_STROKE} />
        ) : (
          <BellOff size={14} strokeWidth={LINE_ICON_STROKE} />
        )}
        {showLabel ? <Text tone={isWatching ? 'inherit' : 'subtle'} variant="meta">{isWatching ? 'Watching' : 'Watch'}</Text> : null}
        {!showLabel || watchers.length > 0 ? <span className="tabular-nums">{watchers.length}</span> : null}
      </button>

      {open && (
        <Surface
          tone="panel" border="default" radius="card" elevation="pop"
          role="menu"
          className="
            absolute right-0 top-full mt-1 z-30 w-64
            py-2 text-left animate-fade-in
          "
          onClick={e => e.stopPropagation()}
        >
          <div className="px-3 py-1.5 border-b border-[var(--panel-border)] flex items-center justify-between">
            <Text as="span" variant="meta" tone="subtle" weight="semibold" className="uppercase tracking-[0.08em] flex items-center gap-1">
              <Users size={12} strokeWidth={LINE_ICON_STROKE} />
              Watchers ({watchers.length})
            </Text>
          </div>

          <div className="max-h-48 overflow-y-auto py-1">
            {watchers.length === 0 ? (
              <Text as="p" variant="body-sm" tone="muted" className="px-3 py-2 italic">
                No one is watching this {scope} yet.
              </Text>
            ) : (
              watchers.map(w => {
                const name = w.display_name || w.email || 'Unknown User';
                return (
                  <div key={w.id} className="flex items-center gap-2 px-3 py-1.5 hover:opacity-80 transition-colors">
                    <Avatar
                      name={name}
                      url={w.avatar_url}
                      attachmentId={w.avatar_attachment_id}
                      userId={w.id}
                      version={w.updated_at}
                      size="xs"
                      ringVariant="none"
                    />
                    <Text as="span" variant="body-sm" tone="default" weight="medium" className="truncate" title={name}>
                      {name}
                    </Text>
                  </div>
                );
              })
            )}
          </div>

          <div className="mt-1.5 px-2 pt-1.5 border-t border-[var(--panel-border)]">
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                onToggle();
              }}
              className={`
                w-full flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors
                ${isWatching
                  ? 'bg-[var(--danger-bg)] text-[var(--danger-fg)] hover:bg-[var(--danger-bg)]/80'
                  : 'bg-[var(--brand-accent)] text-white hover:bg-[var(--brand-accent)]/90'
                }
              `}
            >
              {isWatching ? (
                <>
                  <BellOff size={12} strokeWidth={LINE_ICON_STROKE} />
                  Stop watching
                </>
              ) : (
                <>
                  <Bell size={12} strokeWidth={LINE_ICON_STROKE} />
                  Watch {scope}
                </>
              )}
            </button>
          </div>
        </Surface>
      )}
    </div>
  );
}
