import { Send } from 'lucide-react';

import { LINE_ICON_STROKE } from '../../ui';
import { IconButton } from '../../../ui';
import { MentionableTextarea } from '../../mentions/MentionableTextarea';

/**
 * The single comment composer for the whole app.
 *
 * There were three hand-maintained copies of this chrome — the entry
 * dialog's panel, `EntryCommentsSection` (wiki inline view), and the public
 * shared-track page, which had drifted furthest: a one-line `Input` plus a
 * filled "Send" button, so posting a comment on a public link looked and
 * behaved like a different product from posting one while signed in.
 *
 * Mentions are the one real difference between callers, and it is a
 * capability difference rather than a styling one: an anonymous visitor on a
 * share link has no directory to mention into. `mentions={false}` swaps the
 * picker-backed textarea for a plain one and keeps every other pixel.
 *
 * Colours come from `.comment-composer*` in `index.css` rather than raw
 * token literals here — this file sits outside `src/ui/`, where the ui-drift
 * guard (rightly) refuses them.
 */
export interface CommentComposerProps {
  value: string;
  onChange: (next: string) => void;
  onSubmit: () => void;
  submitting?: boolean;
  placeholder?: string;
  /** Scopes the @-picker to users who can see this track. */
  trackId?: string;
  /** Off for anonymous surfaces — see note above. */
  mentions?: boolean;
  className?: string;
}

export function CommentComposer({
  value,
  onChange,
  onSubmit,
  submitting = false,
  placeholder,
  trackId,
  mentions = true,
  className = '',
}: CommentComposerProps) {
  const canSend = !submitting && value.trim().length > 0;
  /* One line, always. The field is `rows={1}`: typed text scrolls, but a
     placeholder cannot, so a longer hint is simply cut off mid-phrase in a
     narrow column — visible in the dialog's ~230px companion panel, where
     "(use @ to mention)" wrapped and lost its second line. The hint moves to
     the tooltip, where it survives any width. */
  const resolvedPlaceholder = placeholder ?? 'Write a comment…';
  const hint = mentions ? 'Write a comment — type @ to mention someone' : undefined;

  // Enter sends, Shift+Enter breaks the line — the same contract on every
  // surface, so muscle memory carries between them.
  const onKeyDown = (e: { key: string; shiftKey: boolean; preventDefault: () => void }) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (canSend) onSubmit();
    }
  };

  return (
    <div className={`comment-composer ${className}`}>
      <div className="flex-1 min-w-0">
        {mentions ? (
          <MentionableTextarea
            value={value}
            onChange={onChange}
            onKeyDown={onKeyDown}
            placeholder={resolvedPlaceholder}
            title={hint}
            rows={1}
            trackId={trackId}
            className="comment-composer-field"
          />
        ) : (
          <textarea
            value={value}
            onChange={e => onChange(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder={resolvedPlaceholder}
            rows={1}
            aria-label="Write a comment"
            className="comment-composer-field"
          />
        )}
      </div>
      <IconButton
        label="Send comment"
        size="md"
        tone="subtle"
        type="button"
        onClick={() => onSubmit()}
        disabled={!canSend}
        className="shrink-0 disabled:opacity-40"
      >
        <Send size={14} strokeWidth={LINE_ICON_STROKE} aria-hidden />
      </IconButton>
    </div>
  );
}
