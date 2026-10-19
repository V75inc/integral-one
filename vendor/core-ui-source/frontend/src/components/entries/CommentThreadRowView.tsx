import type { ReactNode } from 'react';
import { Avatar } from '../ui/Avatar';
import { AvatarStackedMeta } from '../ui/AvatarStackedMeta';
import { MarkdownContent } from '../ui';
import { formatShortRelativeTime } from '../../utils';

const MAX_VISUAL_INDENT_STEPS = 3;
const INDENT_PX = 14;

export interface CommentThreadRowViewProps {
  displayName: string;
  createdAt: string;
  avatarUrl?: string;
  /** Author user id — required alongside ``avatarAttachmentId`` for the
   *  backend-resolved avatar variant URL. */
  avatarUserId?: string;
  /** Author's avatar attachment id (canonical 128px variant FK). */
  avatarAttachmentId?: string;
  /** Cache-bust token for the avatar URL (typically ``author.updated_at``). */
  avatarVersion?: string | number;
  text: string;
  depth?: number;
  /** When set, clamps comment body (modal uses none = full wrap). */
  lineClamp?: 2 | 3 | 4;
  /** Rendered below the bubble (e.g. Reply) — same column as name/body. */
  footer?: ReactNode;
}

/**
 * Presentational row matching the modal comment thread (avatar + name/time + gray bubble).
 */
export function CommentThreadRowView({
  displayName,
  createdAt,
  avatarUrl,
  avatarUserId,
  avatarAttachmentId,
  avatarVersion,
  text,
  depth = 0,
  lineClamp,
  footer,
}: CommentThreadRowViewProps) {
  const capped = Math.min(depth, MAX_VISUAL_INDENT_STEPS);
  const marginLeft = depth === 0 ? 0 : capped * INDENT_PX;

  const clampClass =
    lineClamp === 2
      ? 'line-clamp-2 overflow-hidden'
      : lineClamp === 3
        ? 'line-clamp-3 overflow-hidden'
        : lineClamp === 4
          ? 'line-clamp-4 overflow-hidden'
          : '';

  return (
    <div
      className={`min-w-0 w-full flex-1 ${
        depth > 0 ? 'border-l-2 border-[var(--panel-border)] pl-3' : ''
      }`}
      style={{ marginLeft }}
    >
      <AvatarStackedMeta
        className="min-w-0"
        avatar={
          <Avatar
            name={displayName}
            size="sm"
            url={avatarUrl}
            attachmentId={avatarAttachmentId}
            userId={avatarUserId}
            version={avatarVersion}
            ringVariant="none"
          />
        }
        primary={
          <p className="text-[15px] font-bold text-[var(--text)] leading-5 truncate">
            {displayName}
          </p>
        }
        secondary={
          <p className="text-xs text-[var(--text-muted)]">
            {formatShortRelativeTime(createdAt)}
          </p>
        }
        body={
          <div className="inline-block max-w-full rounded-lg bg-black/[0.06] px-3 py-2 text-left dark:bg-white/[0.08]">
            <div className={`min-w-0 leading-snug ${clampClass}`.trim()}>
              <MarkdownContent compact={lineClamp != null} mutedBody={false}>
                {text}
              </MarkdownContent>
            </div>
          </div>
        }
        footer={footer ?? undefined}
      />
    </div>
  );
}
