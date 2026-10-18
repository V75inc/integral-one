import { ThumbsUp, MessageSquare, Share2 } from 'lucide-react';
import { entriesApi } from '../../api';
import { publicSharingApi } from '../../api/sharing';
import { useToast } from '../../context/ToastContext';
import { LINE_ICON_STROKE } from '../ui';
import type { Reaction } from '../../types';

interface EntrySocialActionsProps {
  entryId: string;
  trackId: string;
  reactions: Reaction[];
  onReactionsChange(next: Reaction[]): void;
  commentCount: number;
  onCommentsClick(): void;
  className?: string;
  publicMode?: boolean;
  hideComments?: boolean;
  publicToken?: string;
  publicPermissions?: Record<string, boolean>;
}

export function EntrySocialActions({
  entryId,
  trackId,
  reactions,
  onReactionsChange,
  commentCount,
  onCommentsClick,
  className = '',
  publicMode = false,
  hideComments = false,
  publicToken,
  publicPermissions,
}: EntrySocialActionsProps) {
  const { showToast } = useToast();
  const totalLikes = reactions.reduce((acc, r) => acc + r.count, 0);
  const quickLike = reactions.find(r => r.emoji === '👍');
  const quickLikeActive = !!quickLike?.user_reacted;
  const likesHighlighted = totalLikes > 0;
  const commentsHighlighted = commentCount > 0;

  const canReact = publicMode
    ? (publicPermissions?.create_comments ?? false)
    : true;

  const handleLike = async () => {
    if (publicMode && (!canReact || !publicToken)) return;
    const existing = reactions.find(r => r.emoji === '👍');
    try {
      if (existing?.user_reacted) {
        if (publicMode && publicToken) {
          await publicSharingApi.removePublicReaction(publicToken, entryId, '👍');
        } else {
          await entriesApi.removeReaction(entryId, '👍');
        }
        onReactionsChange(
          reactions
            .map(r =>
              r.emoji === '👍'
                ? { ...r, count: r.count - 1, user_reacted: false }
                : r
            )
            .filter(r => r.count > 0)
        );
      } else {
        if (publicMode && publicToken) {
          await publicSharingApi.addPublicReaction(publicToken, entryId, '👍');
        } else {
          await entriesApi.addReaction(entryId, '👍');
        }
        const ex = reactions.find(r => r.emoji === '👍');
        if (ex) {
          onReactionsChange(
            reactions.map(r =>
              r.emoji === '👍'
                ? { ...r, count: r.count + 1, user_reacted: true }
                : r
            )
          );
        } else {
          onReactionsChange([
            ...reactions,
            { emoji: '👍', count: 1, user_reacted: true },
          ]);
        }
      }
    } catch {
      showToast('Failed to update reaction', 'error');
    }
  };

  const handleShare = () => {
    const u = new URL(`/tracks/${trackId}`, window.location.origin);
    u.searchParams.set('entry', entryId);
    const url = u.toString();
    void navigator.clipboard.writeText(url).then(
      () => showToast('Link copied', 'success'),
      () => showToast('Could not copy link', 'error')
    );
  };

  return (
    <div
      className={`flex flex-wrap items-center gap-x-4 gap-y-2 text-xs ${className}`}
    >
      {!hideComments && (
        <button
          type="button"
          onClick={!canReact ? undefined : handleLike}
          disabled={!canReact}
          className={`inline-flex items-center gap-1.5 rounded-sm transition-colors duration-fast ${
            !canReact ? 'cursor-default' : ''
          } ${
            likesHighlighted
              ? 'text-[var(--text)] font-medium'
              : 'text-[var(--text-subtle)]' + (!canReact ? '' : ' hover:text-[var(--text)]')
          }`}
          aria-label={quickLikeActive ? 'Remove like' : 'Like'}
        >
          <ThumbsUp size={13} strokeWidth={LINE_ICON_STROKE} className="shrink-0" />
          <span className="tabular-nums">{totalLikes}</span>
        </button>
      )}
      {!hideComments && (
        <button
          type="button"
          onClick={onCommentsClick}
          className={`inline-flex items-center gap-1.5 rounded-sm transition-colors duration-fast ${
            commentsHighlighted
              ? 'text-[var(--text)] font-medium'
              : 'text-[var(--text-subtle)] hover:text-[var(--text)]'
          }`}
          aria-label="Comments"
        >
          <MessageSquare size={13} strokeWidth={LINE_ICON_STROKE} className="shrink-0" />
          <span className="tabular-nums">{commentCount}</span>
        </button>
      )}
      {!publicMode && (
        <button
          type="button"
          onClick={handleShare}
          className="inline-flex items-center gap-1.5 rounded-sm text-[var(--text-subtle)] hover:text-[var(--text)] transition-colors duration-fast"
          aria-label="Copy link to this entry"
        >
          <Share2 size={13} strokeWidth={LINE_ICON_STROKE} className="shrink-0" />
        </button>
      )}
    </div>
  );
}
