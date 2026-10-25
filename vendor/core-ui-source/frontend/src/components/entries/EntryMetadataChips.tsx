import { tagFilterHref } from '../../utils/tagFilters';
import { Link, useLocation } from 'react-router-dom';
import { Pill } from '../ui/Pill';
import { TagChip } from '../../ui';
import type { PillVariant } from '../ui';
import type { Entry, Tag } from '../../types';
import { appPath } from '../../utils/resourcePaths';

/** Entry-type → Pill variant — kept in sync with EntryCard's mapping
 *  so the same entry shows the same accent in feed row and dialog. */
function pillVariantForType(type: string): PillVariant {
  const t = (type || '').toLowerCase().trim();
  if (!t) return 'neutral';
  if (t === 'decision') return 'brand';
  if (t === 'issue' || t === 'bug' || t === 'blocker') return 'danger';
  if (t === 'done' || t === 'shipped' || t === 'resolved') return 'success';
  if (t === 'idea') return 'warning';
  return 'neutral';
}

function prettifyType(type: string): string {
  if (!type) return '';
  const cleaned = type.trim().replace(/[_-]+/g, ' ');
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1).toLowerCase();
}

/** Entry type next to byline time — quiet QP pill (no solid icon
 *  circle), kept consistent with the feed-row treatment. */
export function EntryTypeSubline({ type }: { type: string }) {
  const label = prettifyType(type) || 'Entry';
  const variant = pillVariantForType(type);
  return (
    <Pill tone="descriptive" variant={variant}>
      {label}
    </Pill>
  );
}

const chipLinkClass =
  'inline-flex max-w-[200px] items-center truncate rounded-full bg-[var(--badge-muted-bg)] text-[var(--badge-muted-fg)] px-2 py-0.5 text-xs font-medium transition-colors hover:opacity-80 hover:text-[var(--text)]';

/** Prefer API ``name``; avoid showing raw node id when label is missing or equals id. */
function tagChipLabel(tag: Tag): string {
  const raw = (tag.name ?? '').trim();
  const id = tag.id ?? '';
  if (raw && raw !== id && !/^n\.tag\./i.test(raw)) return raw;
  return 'Tag';
}


interface EntryMetadataChipsProps {
  entry: Entry;
  showTrackChip?: boolean;
  className?: string;
}

/** App, track, and tags — compact chips for header rows (entry type lives on byline). */
export function EntryMetadataChips({
  entry,
  showTrackChip = true,
  className = '',
}: EntryMetadataChipsProps) {
  const location = useLocation();
  return (
    <div
      className={`flex flex-wrap items-center justify-start gap-1.5 sm:justify-end ${className}`}
    >
      {entry.app?.id ? (
        <Link
          to={appPath(entry.app.id)}
          className={chipLinkClass}
          onClick={e => e.stopPropagation()}
        >
          {entry.app.name || 'App'}
        </Link>
      ) : null}
      {showTrackChip && entry.track?.id ? (
        <Link
          to={`/tracks/${entry.track.id}`}
          className={chipLinkClass}
          onClick={e => e.stopPropagation()}
        >
          {entry.track.title}
        </Link>
      ) : null}
      {entry.tags?.map(tag => (
        <Link
          key={tag.id}
          to={tagFilterHref(location.pathname, location.search, tag.id)}
          className="inline-flex min-w-0 max-w-full rounded-[var(--radius-input)] transition-opacity hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring-color)]"
          onClick={e => e.stopPropagation()}
          title={`Filter feed by ${tagChipLabel(tag)}`}
        >
          <TagChip label={tagChipLabel(tag)} color={tag.color} />
        </Link>
      ))}
    </div>
  );
}
