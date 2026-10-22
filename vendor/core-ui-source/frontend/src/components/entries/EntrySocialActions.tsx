import { ReactionControl } from './ReactionControl';
import { MessageSquare, Share2 } from 'lucide-react';
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
  canReact?: boolean;
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
  canReact: canReactProp = true,
  hideComments = false,
  publicToken,
  publicPermissions,
}: EntrySocialActionsProps) {
  const { showToast } = useToast();
  const commentsHighlighted = commentCount > 0;
  const canReact = publicMode ? (publicPermissions?.create_comments ?? false) : canReactProp;

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
      <ReactionControl targetId={entryId} reactions={reactions} onChange={onReactionsChange}
        disabled={!canReact || (publicMode && !publicToken)} publicToken={publicToken} />
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
