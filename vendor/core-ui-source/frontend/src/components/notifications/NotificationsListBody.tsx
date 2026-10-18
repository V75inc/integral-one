import { Bell, Check } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { EmptyState, IconWell, LINE_ICON_STROKE } from '../ui';
import { formatRelativeTime, resolveNotificationHref } from '../../utils';
import type { Notification } from '../../types';

/**
 * Notification messages are persisted as a single ``content`` string in
 * the form ``"<Actor>: <Title> <Body>"`` (no separator between Title and
 * Body — B-NOTIF-01 from the V1 review). Until the backend grows a
 * structured payload, parse the leading actor in the renderer so the
 * actor reads as a name chip rather than continuous prose.
 */
function NotificationContent({
  content,
  unread,
}: {
  content: string;
  unread: boolean;
}) {
  // Split on the first colon. Heuristic: actor names don't contain colons,
  // and the substring before the colon must look like a name (no double
  // spaces, no URLs, short-ish). If parsing fails, fall back to the raw
  // string.
  const idx = content.indexOf(':');
  const looksLikeActor =
    idx > 0 &&
    idx <= 64 &&
    !content.slice(0, idx).includes('\n') &&
    !/https?:\/\//u.test(content.slice(0, idx));
  if (!looksLikeActor) {
    return (
      <p
        className={`text-sm ${
          unread
            ? 'text-[var(--text)] font-medium'
            : 'text-[var(--text-muted)]'
        }`}
      >
        {content}
      </p>
    );
  }
  const actor = content.slice(0, idx).trim();
  const rest = content.slice(idx + 1).trim();
  return (
    <p
      className={`text-sm ${
        unread ? 'text-[var(--text)]' : 'text-[var(--text-muted)]'
      }`}
    >
      <span className={unread ? 'font-medium text-[var(--text)]' : ''}>
        {actor}
      </span>
      <span className="text-[var(--text-muted)]"> · </span>
      <span>{rest}</span>
    </p>
  );
}

interface NotificationsListBodyProps {
  notifications: Notification[];
  loading: boolean;
  error: string | null;
  onRetry(): void;
  onMarkRead(id: string): void;
  onNavigate?(href: string): void;
  compact?: boolean;
}

export function NotificationsListBody({
  notifications,
  loading,
  error,
  onRetry,
  onMarkRead,
  onNavigate,
  compact,
}: NotificationsListBodyProps) {
  const navigate = useNavigate();
  if (error) {
    return (
      <div
        className="rounded-[var(--radius-card)] border border-[color:var(--danger-fg)]/30 bg-[var(--danger-bg)] px-4 py-3 text-sm text-[var(--danger-fg)]"
        role="alert"
      >
        {error}
        <button type="button" className="ml-3 underline" onClick={onRetry}>
          Retry
        </button>
      </div>
    );
  }

  if (loading) {
    return (
      <div className={compact ? 'space-y-2' : 'space-y-3'}>
        {(compact ? [1, 2, 3, 4] : [1, 2, 3, 4, 5]).map(i => (
          <div
            key={i}
            className={`bg-[var(--panel-2)] rounded-lg animate-pulse ${
              compact ? 'h-14' : 'h-16'
            }`}
          />
        ))}
      </div>
    );
  }

  if (notifications.length === 0) {
    return (
      <EmptyState
        surface="card"
        icon={
          <IconWell size="lg" aria-hidden>
            <Bell size={22} strokeWidth={LINE_ICON_STROKE} />
          </IconWell>
        }
        title="No notifications"
        description="You're all caught up. We'll show updates here when there's activity."
      />
    );
  }

  return (
    <div className={compact ? 'space-y-1.5' : 'space-y-2'}>
      {notifications.map(n => {
        const href = resolveNotificationHref(n);
        return (
        <div
          key={n.id}
          className={`flex items-start gap-3 rounded-lg border transition-all ${
            compact ? 'p-3' : 'p-4 gap-4'
          } ${
            n.read
              ? 'bg-[var(--panel)] border-[var(--panel-border)]'
              : 'bg-[var(--nav-active-bg)] border-[var(--panel-border)]'
          } ${href ? 'cursor-pointer hover:bg-[var(--panel-2)]' : ''}`}
          onClick={
            href
              ? () => {
                  if (!n.read) onMarkRead(n.id);
                  onNavigate?.(href);
                  navigate(href);
                }
              : undefined
          }
        >
          <div
            className={`rounded-full mt-1.5 shrink-0 ${
              compact ? 'w-2 h-2' : 'w-2.5 h-2.5'
            } ${n.read ? 'bg-[var(--panel-border)]' : 'bg-[var(--text)]'}`}
          />
          <div className="flex-1 min-w-0">
            <NotificationContent content={n.content} unread={!n.read} />
            <p className="text-xs text-[var(--text-muted)] mt-0.5">
              {formatRelativeTime(n.created_at)}
            </p>
          </div>
          {!n.read && (
            <button
              type="button"
              onClick={e => {
                e.stopPropagation();
                onMarkRead(n.id);
              }}
              className="p-1.5 rounded-lg hover:bg-[var(--panel-2)] text-[var(--link)] transition-colors shrink-0"
              aria-label="Mark notification as read"
            >
              <Check size={14} strokeWidth={LINE_ICON_STROKE} />
            </button>
          )}
        </div>
        );
      })}
    </div>
  );
}
