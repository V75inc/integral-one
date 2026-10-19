import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Avatar } from './Avatar';
import { AvatarStackedMeta } from './AvatarStackedMeta';
import { formatShortRelativeTime } from '../../utils';

export interface UserBylineProps {
  name: string;
  timeIso: string;
  avatarUrl?: string;
  /** Phase 9 Plan 09-01 (AVT-02) — when supplied with ``userId`` the
   *  rendered Avatar resolves the backend variant URL (preferred over
   *  ``avatarUrl``). */
  attachmentId?: string;
  /** Owning user's id; required alongside ``attachmentId``. */
  userId?: string;
  /** Cache-bust token (typically the user's ``updated_at``). */
  version?: string | number;
  size?: 'xs' | 'sm' | 'md';
  /** Tighter type scale (e.g. comment previews). */
  compact?: boolean;
  className?: string;
  /** Shown on the same row as the relative time, before it (e.g. entry type). */
  sublinePrefix?: ReactNode;
  children?: ReactNode;
  /** When provided, the name renders as a router Link to this URL.
   *  Used by EntryDetail to make the author byline pivot the feed
   *  onto that author. */
  nameTo?: string;
  /** Tooltip for the name link (e.g. "Filter feed by Alex"). */
  nameTitle?: string;
}

/**
 * Avatar + stacked name / short time (e.g. 8h), aligned like a social post header.
 */
export function UserByline({
  name,
  timeIso,
  avatarUrl,
  attachmentId,
  userId,
  version,
  size = 'sm',
  compact = false,
  className = '',
  sublinePrefix,
  children,
  nameTo,
  nameTitle,
}: UserBylineProps) {
  const nameCls = compact
    ? 'text-sm font-medium text-[var(--text)] leading-5 truncate tracking-[-0.01em]'
    : 'text-[15px] font-medium text-[var(--text)] leading-5 truncate tracking-[-0.011em]';

  const metaCls = compact
    ? 'text-[13px] text-[var(--text-muted)]'
    : 'text-xs text-[var(--text-muted)]';

  const nameNode = nameTo ? (
    <Link
      to={nameTo}
      title={nameTitle}
      onClick={e => e.stopPropagation()}
      className={`${nameCls} block hover:text-[var(--link)] transition-colors duration-fast`}
    >
      {name}
    </Link>
  ) : (
    <p className={nameCls}>{name}</p>
  );

  return (
    <AvatarStackedMeta
      className={className}
      avatar={
        <Avatar
          name={name}
          size={size}
          url={avatarUrl}
          attachmentId={attachmentId}
          userId={userId}
          version={version}
          ringVariant="none"
        />
      }
      primary={nameNode}
      secondary={
        <p
          className={`${metaCls} flex flex-wrap items-center gap-x-2 gap-y-0.5`}
        >
          {sublinePrefix}
          {sublinePrefix ? (
            <span className="text-[var(--text-muted)] opacity-50" aria-hidden>
              ·
            </span>
          ) : null}
          <span>{formatShortRelativeTime(timeIso)}</span>
        </p>
      }
      afterMeta={children ?? undefined}
    />
  );
}
