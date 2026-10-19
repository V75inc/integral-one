import { Link } from 'react-router-dom';
import { LayoutGrid } from 'lucide-react';
import { LINE_ICON_STROKE } from '../ui';
import type { Track } from '../../types';

export function TrendingTrackLink({ track }: { track: Track }) {
  return (
    <Link
      to={`/tracks/${track.id}`}
      className="flex items-center gap-3 rounded-lg border border-[var(--panel-border)] bg-[var(--panel-2)] px-3 py-2 transition-colors hover:border-[var(--text-muted)]/30 hover:bg-[var(--panel)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring-color)]"
    >
      <div
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg shadow-sm bg-[var(--brand-accent)]"
      >
        <LayoutGrid
          size={18}
          strokeWidth={LINE_ICON_STROKE}
          className="text-[var(--brand-accent-contrast)]"
          aria-hidden
        />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-[var(--text)]">{track.title}</p>
        <p className="text-xs text-[var(--text-muted)]">
          {track.entry_count || 0}{' '}
          {(track.entry_count || 0) === 1 ? 'update' : 'updates'}
        </p>
      </div>
    </Link>
  );
}
