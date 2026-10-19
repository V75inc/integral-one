import { Link } from 'react-router-dom';
import type { ReactNode } from 'react';
import { Users, FileText, LayoutGrid } from 'lucide-react';
import { Avatar, LINE_ICON_STROKE, Pill } from '../ui';
import { formatRelativeTime, resolveIdentityColor } from '../../utils';
import { useScope } from '../../context/ScopeContext';
import type { Track } from '../../types';

interface TrackCardProps {
  track: Track;
  /** Shown under the main link (e.g. app actions). */
  footer?: ReactNode;
  /** Show visibility chip in the meta row (e.g. on app detail). */
  showVisibility?: boolean;
}

export function TrackCard({ track, footer, showVisibility }: TrackCardProps) {
  const { activeWorkspace } = useScope();
  const accentColor = resolveIdentityColor(track.accent_color, activeWorkspace?.accent_color);
  return (
    <div className="flex h-full min-w-0 flex-col overflow-hidden rounded-[var(--radius-card)] border border-[var(--panel-border)] bg-[var(--panel)] transition-[border-color,box-shadow] duration-fast hover:border-[var(--text-muted)]/30 group">
      <Link
        to={`/tracks/${track.id}`}
        className="block min-h-0 min-w-0 flex-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--focus-ring-color)]"
      >
        <div className="h-2 bg-[var(--brand-accent)]" style={{ backgroundColor: accentColor }} />
        <div className="p-5">
          <div className="mb-3 flex items-start gap-3">
            <div
              className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg shadow-sm bg-[var(--brand-accent)]"
              style={{ backgroundColor: accentColor }}
            >
              <LayoutGrid
                size={20}
                strokeWidth={LINE_ICON_STROKE}
                className="text-[var(--brand-accent-contrast)]"
                aria-hidden
              />
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="truncate font-semibold text-[var(--text)] transition-colors group-hover:text-[var(--link-hover)]">
                {track.title}
              </h3>
              <p className="mt-0.5 line-clamp-2 text-xs text-[var(--text-muted)]">
                {track.purpose || track.description || 'No description'}
              </p>
            </div>
          </div>
          <div className="mt-4 flex items-center justify-between">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[var(--text-muted)]">
              <span className="flex items-center gap-1">
                <FileText size={12} strokeWidth={LINE_ICON_STROKE} aria-hidden />
                {track.entry_count || 0}{' '}
                {(track.entry_count || 0) === 1 ? 'entry' : 'entries'}
              </span>
              {showVisibility ? (
                <Pill tone="status" variant="neutral">
                  {track.visibility}
                </Pill>
              ) : null}
              {track.collaborators && track.collaborators.length > 0 ? (
                <span className="flex items-center gap-1">
                  <Users size={12} strokeWidth={LINE_ICON_STROKE} aria-hidden />
                  {track.collaborators.length}
                </span>
              ) : null}
            </div>
            {track.collaborators && track.collaborators.length > 0 ? (
              <div className="flex -space-x-1.5 shrink-0">
                {track.collaborators.slice(0, 4).map(u => (
                  <Avatar
                    key={u.id}
                    name={u.display_name}
                    size="xs"
                    attachmentId={u.avatar_attachment_id}
                    userId={u.id}
                    version={u.updated_at}
                  />
                ))}
              </div>
            ) : null}
          </div>
          {track.updated_at ? (
            <p className="mt-2 text-xs text-[var(--text-subtle)]">
              {formatRelativeTime(track.updated_at)}
            </p>
          ) : null}
        </div>
      </Link>
      {footer != null ? (
        <div className="border-t border-[var(--panel-border)] bg-[var(--panel-2)]/40 px-5 py-2.5">
          {footer}
        </div>
      ) : null}
    </div>
  );
}
