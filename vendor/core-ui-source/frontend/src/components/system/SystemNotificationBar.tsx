/**
 * SystemNotificationBar — top-of-page banner that renders the highest-priority
 * active notification from SystemNotificationsContext.
 *
 * Visual + motion (HelloBar pattern):
 *   - position: fixed top:0, z-1000 (above app chrome, below modals at 1100)
 *   - Slide-down entrance via transform/opacity (CSS class, data-open toggle)
 *     so React re-renders don't reset the transition mid-flight
 *   - Solid dark chrome in both themes so scrolled content never bleeds through
 *   - Shared compact message/action row, with a narrow-screen fallback
 *
 * Sidebar offset / content push-down:
 *   - Sets --system-bar-h on :root after the entrance starts; the layout
 *     root has transition: padding-top on var change → smooth content push
 *
 * Accessibility:
 *   - role="status" + aria-live (assertive for errors)
 *   - prefers-reduced-motion respected (transitions disabled via @media)
 */

import { useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle,
  Info,
  Loader2,
  X,
  type LucideIcon,
} from 'lucide-react';
import {
  useSystemNotificationCurrent,
  useSystemNotifications,
  type SystemNotification,
  type SystemNotificationType,
} from './SystemNotificationsContext';
import { LINE_ICON_STROKE } from '../ui/IconWell';
import { Text } from '../../ui';

const CSS_VAR = '--system-bar-h';
const ENTER_DELAY = 500; // ms after mount before slide-down begins

const TYPE_ICON: Record<SystemNotificationType, LucideIcon> = {
  info: Info,
  warning: AlertTriangle,
  error: AlertCircle,
  success: CheckCircle,
};

interface TypeStyle {
  accentFg: string;
}

const TYPE_STYLE: Record<SystemNotificationType, TypeStyle> = {
  info: { accentFg: 'var(--system-bar-info-fg)' },
  warning: { accentFg: 'var(--system-bar-warn-fg)' },
  error: { accentFg: 'var(--system-bar-error-fg)' },
  success: { accentFg: 'var(--system-bar-success-fg)' },
};

export function SystemNotificationBar() {
  const current = useSystemNotificationCurrent();
  const { dismiss } = useSystemNotifications();

  // open=true → slide in; flipped 500ms after a notification appears.
  const [open, setOpen] = useState(false);
  const [busyActions, setBusyActions] = useState<Record<string, boolean>>({});
  const barRef = useRef<HTMLDivElement>(null);
  const openedRef = useRef(false);
  const currentId = current?.id ?? null;

  // Schedule open=true after the delay, once we have a notification.
  // While open, a ResizeObserver keeps --system-bar-h in sync with
  // the bar's full height, including its border — so title/body/action edits after the
  // initial measurement don't leave the layout's padding-top stale.
  useEffect(() => {
    if (!currentId) {
      setOpen(false);
      openedRef.current = false;
      document.documentElement.style.setProperty(CSS_VAR, '0px');
      return;
    }
    let ro: ResizeObserver | null = null;
    const publishHeight = () => {
      const h = barRef.current?.getBoundingClientRect().height ?? 0;
      if (h > 0) {
        document.documentElement.style.setProperty(CSS_VAR, `${h}px`);
      }
    };
    const reveal = () => {
      openedRef.current = true;
      setOpen(true);
      publishHeight();
      if (barRef.current && typeof ResizeObserver !== 'undefined') {
        ro = new ResizeObserver(() => publishHeight());
        ro.observe(barRef.current);
      }
    };
    // Swapping queued notices must not briefly release the layout offset.
    const t = openedRef.current ? null : window.setTimeout(reveal, ENTER_DELAY);
    if (openedRef.current) reveal();
    return () => {
      if (t !== null) clearTimeout(t);
      if (ro) ro.disconnect();
    };
  }, [currentId]);

  useEffect(() => () => {
    document.documentElement.style.setProperty(CSS_VAR, '0px');
  }, []);

  if (!current) return null;

  const Icon = current.icon ?? TYPE_ICON[current.type];
  const style = TYPE_STYLE[current.type];
  const isError = current.type === 'error';
  const dismissible = current.dismissible !== false;

  const linkCls = `
    cursor-pointer relative flex h-10 items-center justify-center whitespace-nowrap px-3
    hover:opacity-80 transition-opacity
    disabled:opacity-50 disabled:cursor-not-allowed
    rounded-[var(--radius-input)] hover:bg-[var(--system-bar-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--system-bar-focus)]
  `;

  const runAction = async (
    idx: number,
    action: NonNullable<SystemNotification['actions']>[number],
  ) => {
    const key = `${current.id}:${idx}`;
    setBusyActions((b) => ({ ...b, [key]: true }));
    try {
      await action.onClick();
    } finally {
      setBusyActions((b) => {
        const next = { ...b };
        delete next[key];
        return next;
      });
    }
  };

  return (
    <div
      ref={barRef}
      role="status"
      aria-live={isError ? 'assertive' : 'polite'}
      data-open={open ? 'true' : 'false'}
      className="
        system-bar-animated
        fixed top-0 left-0 right-0 z-system-bar
        border-b
      "
      style={{
        backgroundColor: 'var(--system-bar-bg)',
        color: 'var(--system-bar-fg)',
        borderColor: 'var(--system-bar-border)',
      }}
    >
      <div className="relative w-full px-4 py-2 sm:px-6">
        <Text as="div" variant="body-sm" tone="inherit" className={`mx-auto grid min-h-10 max-w-7xl grid-cols-[20px_minmax(0,1fr)] items-center gap-x-3 gap-y-1 md:flex md:justify-center ${dismissible ? 'pr-10' : ''}`}>
          <Icon size={20} strokeWidth={LINE_ICON_STROKE} className="shrink-0 self-center" style={{ color: style.accentFg }} aria-hidden />
          <Text as="p" variant="body-sm" tone="inherit" className="min-w-0 [overflow-wrap:anywhere]">
            <Text as="span" variant="body-sm" weight="medium" tone="inherit">{current.title}</Text>
            {current.body && <span style={{ color: 'var(--system-bar-muted)' }}>{' · '}{current.body}</span>}
          </Text>
          {current.actions && current.actions.length > 0 && (
            <div className="col-start-2 flex flex-wrap items-center gap-1 md:shrink-0 md:flex-nowrap">
              {current.actions.map((action, i) => {
                const busy = action.busy || !!busyActions[`${current.id}:${i}`];
                return (
                  <button key={i} type="button" disabled={busy} aria-busy={busy} onClick={() => runAction(i, action)}
                    className={`${linkCls} ${i === 0 ? 'border' : 'border border-transparent'}`}
                    style={{ color: 'var(--system-bar-fg)', borderColor: i === 0 ? 'var(--system-bar-action-border)' : undefined }}>
                    <Text variant="body-sm" weight="medium" tone="inherit" className={busy ? 'opacity-0' : undefined}>{action.label}</Text>
                    {busy && <Loader2 size={16} strokeWidth={LINE_ICON_STROKE} aria-hidden className="absolute animate-spin motion-reduce:animate-none" />}
                  </button>
                );
              })}
            </div>
          )}
        </Text>
        {dismissible && (
          <button
            type="button"
            onClick={() => { current.onUserDismiss?.(); dismiss(current.id); }}
            aria-label="Dismiss notification"
            className="
              absolute right-2 top-2
              flex h-10 w-10 items-center justify-center
              rounded-[var(--radius-input)]
              text-[var(--system-bar-muted)]
              hover:bg-[var(--system-bar-hover)] hover:text-[var(--system-bar-fg)] transition-colors
              focus:outline-none focus:ring-2 focus:ring-[var(--system-bar-focus)]
            "
          >
            <X size={16} strokeWidth={LINE_ICON_STROKE} />
          </button>
        )}
      </div>
    </div>
  );
}
