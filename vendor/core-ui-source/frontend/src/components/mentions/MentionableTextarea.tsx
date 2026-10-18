/**
 * MentionableTextarea — drop-in textarea with @-mention autocomplete.
 *
 * Composes ``useMentionAutocomplete`` + ``MentionPopover`` and renders
 * the standard chrome. Pass the same ``value`` / ``onChange`` you'd
 * pass to a plain ``<textarea>``; everything else (className, rows,
 * placeholder, onKeyDown, etc.) is forwarded through.
 *
 * The trigger logic + token-insertion semantics live in
 * ``useMentionAutocomplete``; this component is just the host-side glue
 * that wires keystrokes / caret events to the hook + renders the
 * popover anchored relative to the textarea.
 */
import {
  forwardRef,
  useCallback,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';

import { useMentionAutocomplete } from '../../hooks/useMentionAutocomplete';
import { MentionPopover } from './MentionPopover';
import { getMentionPopoverAnchor } from './mentionPopoverAnchor';
import type { User } from '../../types';

interface Props
  extends Omit<
    React.TextareaHTMLAttributes<HTMLTextAreaElement>,
    'value' | 'onChange'
  > {
  value: string;
  onChange: (next: string) => void;
  /** Scopes the @-picker to users with effective visibility on this
   *  track. Forwarded to ``MentionPopover``; without it the picker
   *  queries the global user list. */
  trackId?: string;
}

export const MentionableTextarea = forwardRef<HTMLTextAreaElement, Props>(
  function MentionableTextarea(
    { value, onChange, onKeyDown, onKeyUp, onClick, trackId, ...rest },
    ref,
  ) {
    const localRef = useRef<HTMLTextAreaElement | null>(null);
    useImperativeHandle(ref, () => localRef.current as HTMLTextAreaElement, []);

    const mention = useMentionAutocomplete({
      value,
      onChange,
      hostRef: localRef,
    });

    const [candidates, setCandidates] = useState<User[]>([]);
    const [highlight, setHighlight] = useState(0);

    const onCandidatesChange = useCallback((next: User[]) => {
      setCandidates(next);
      setHighlight(0);
    }, []);

    const moveHighlight = useCallback(
      (delta: number) => {
        setHighlight(i => {
          if (candidates.length === 0) return 0;
          const n = candidates.length;
          return ((i + delta) % n + n) % n;
        });
      },
      [candidates.length],
    );

    const selectHighlighted = useCallback(() => {
      const u = candidates[highlight];
      if (u) mention.replaceWithMention(u);
    }, [candidates, highlight, mention]);

    const handleKeyDown = useCallback(
      (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        // Hook claims navigation + dismiss keys when active. Forward
        // anything it doesn't handle through to the caller.
        const handled = mention.handleKeyDown(e, {
          onArrowDown: () => moveHighlight(1),
          onArrowUp: () => moveHighlight(-1),
          onEnter: () => selectHighlighted(),
          onTab: () => selectHighlighted(),
        });
        if (handled) {
          e.preventDefault();
          e.stopPropagation();
          return;
        }
        onKeyDown?.(e);
      },
      [mention, moveHighlight, selectHighlighted, onKeyDown],
    );

    const handleKeyUp = useCallback(
      (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        mention.onCaretChange();
        onKeyUp?.(e);
      },
      [mention, onKeyUp],
    );

    const handleClick = useCallback(
      (e: React.MouseEvent<HTMLTextAreaElement>) => {
        mention.onCaretChange();
        onClick?.(e);
      },
      [mention, onClick],
    );

    // Caret-anchored popover position — translated to VIEWPORT coords
    // (not textarea-relative) because the popover renders via portal
    // at document.body to escape modal / dialog ``overflow-hidden``
    // clipping. ``getCaretCoordinates`` measures (x, y) of the caret
    // inside the textarea via a hidden mirror ``<div>``; we add the
    // textarea's bounding rect to translate textarea-local → viewport.
    //
    // Flip-above logic: when the popover would clip the viewport
    // bottom edge (caret near the bottom of the screen — common in
    // modals where the textarea sits at the bottom), anchor ABOVE
    // the caret line instead. Conservative height estimate (320px)
    // matches the popover's max content height (8 rows × ~50px + py).
    const popoverAnchor = useMemo(() => {
      const el = localRef.current;
      if (!el || !mention.state.active) return null;
      return getMentionPopoverAnchor(el, mention.state.caretIndex);
    }, [mention.state.active, mention.state.caretIndex]);

    return (
      <div className="relative" data-mention-host>
        <textarea
          ref={localRef}
          value={value}
          onChange={e => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          onKeyUp={handleKeyUp}
          onClick={handleClick}
          {...rest}
        />
        {mention.state.active && popoverAnchor ? (
          <MentionPopover
            query={mention.state.query}
            position={popoverAnchor}
            highlightIndex={highlight}
            onCandidatesChange={onCandidatesChange}
            onSelect={u => mention.replaceWithMention(u)}
            onDismiss={mention.dismiss}
            trackId={trackId}
          />
        ) : null}
      </div>
    );
  },
);
