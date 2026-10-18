/**
 * TaggableComposer — textarea with @ user and # app/track autocomplete.
 */
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import { useTriggerAutocomplete } from '../../hooks/useTriggerAutocomplete';
import {
  normalizeEntityRef,
  normalizeEntityRefs,
  tokenTextForResourceLabel,
  tokenTextForUser,
} from './chatEntityTokens';
import { MentionPopover } from '../mentions/MentionPopover';
import { getMentionPopoverAnchor } from '../mentions/mentionPopoverAnchor';
import type { User } from '../../types';
import type { ChatEntityRef } from '../../types/chatEntityRefs';
import { useScopeOptional } from '../../context/ScopeContext';
import {
  ResourceTagPopover,
  prefetchTagResources,
  resourceCandidateToEntityRef,
  type ResourceTagCandidate,
} from './ResourceTagPopover';
import { CHAT_TAG_POPOVER_Z_INDEX, renderTaggedText } from './renderTaggedText';
import { syncEntityRefsFromText } from './syncEntityRefsFromText';

type ActiveTrigger = '@' | '#' | null;

interface TaggableComposerProps
  extends Omit<
    React.TextareaHTMLAttributes<HTMLTextAreaElement>,
    'value' | 'onChange'
  > {
  value: string;
  onChange: (next: string) => void;
  entityRefs: ChatEntityRef[];
  onEntityRefsChange: (refs: ChatEntityRef[]) => void;
  /** Called on Enter (no Shift) when the tag popover is not selecting. */
  onSubmit?: () => void;
}

function userToEntityRef(user: User): ChatEntityRef {
  return normalizeEntityRef({
    kind: 'user',
    id: user.id,
    label: (user.display_name || user.email || 'Unnamed user').trim(),
    display_name: user.display_name,
    email: user.email,
  });
}

export const TaggableComposer = forwardRef<HTMLTextAreaElement, TaggableComposerProps>(
  function TaggableComposer(
    {
      value,
      onChange,
      entityRefs,
      onEntityRefsChange,
      onSubmit,
      onKeyDown,
      onKeyUp,
      onClick,
      onScroll,
      className = '',
      style,
      ...rest
    },
    ref,
  ) {
    const localRef = useRef<HTMLTextAreaElement | null>(null);
    const mirrorRef = useRef<HTMLDivElement | null>(null);
    useImperativeHandle(ref, () => localRef.current as HTMLTextAreaElement, []);

    // Auto-grow the textarea to fit its content. We cap the textarea's own
    // inline height at MAX_H px so the cap never lands on the mirror div via
    // a shared CSS class. Past the cap the textarea scrolls internally;
    // syncMirrorScroll keeps the mirror in sync via programmatic scrollTop.
    const MAX_H = 160;
    useLayoutEffect(() => {
      const el = localRef.current;
      if (!el) return;
      el.style.height = 'auto';
      el.style.height = `${Math.min(el.scrollHeight, MAX_H)}px`;
    }, [value]);

    const scopeCtx = useScopeOptional();
    const workspaceId = scopeCtx?.scope?.workspaceId ?? null;

    useEffect(() => {
      prefetchTagResources(workspaceId);
    }, [workspaceId]);

    const handleFocus = useCallback(
      (e: React.FocusEvent<HTMLTextAreaElement>) => {
        prefetchTagResources(workspaceId);
        rest.onFocus?.(e);
      },
      [workspaceId, rest.onFocus],
    );

    const atAuto = useTriggerAutocomplete<User>({
      trigger: '@',
      value,
      onChange,
      hostRef: localRef,
      buildToken: tokenTextForUser,
    });

    const hashAuto = useTriggerAutocomplete<ResourceTagCandidate>({
      trigger: '#',
      value,
      onChange,
      hostRef: localRef,
      buildToken: (item: ResourceTagCandidate) => tokenTextForResourceLabel(item.label),
    });

    const activeTrigger: ActiveTrigger = atAuto.state.active
      ? '@'
      : hashAuto.state.active
        ? '#'
        : null;

    const activeAuto = activeTrigger === '@' ? atAuto : activeTrigger === '#' ? hashAuto : null;

    const [userCandidates, setUserCandidates] = useState<User[]>([]);
    const [resourceCandidates, setResourceCandidates] = useState<ResourceTagCandidate[]>(
      [],
    );
    const [highlight, setHighlight] = useState(0);

    const selectUser = useCallback(
      (u: User) => {
        const next = atAuto.replaceWithSelection(u);
        const refItem = userToEntityRef(u);
        const nextText = next ?? `${value}@${refItem.label} `;
        const nextRefs = [
          ...entityRefs.filter(
            r => r.id !== refItem.id || r.kind !== refItem.kind,
          ),
          refItem,
        ];
        onEntityRefsChange(syncEntityRefsFromText(nextText, nextRefs));
      },
      [atAuto, entityRefs, onEntityRefsChange, value],
    );

    const selectResource = useCallback(
      (item: ResourceTagCandidate) => {
        const next = hashAuto.replaceWithSelection(item);
        const refItem = resourceCandidateToEntityRef(item);
        const nextText = next ?? `${value}#${refItem.label} `;
        const nextRefs = [
          ...entityRefs.filter(
            r => r.id !== refItem.id || r.kind !== refItem.kind,
          ),
          refItem,
        ];
        onEntityRefsChange(syncEntityRefsFromText(nextText, nextRefs));
      },
      [entityRefs, hashAuto, onEntityRefsChange, value],
    );

    const handleValueChange = useCallback(
      (next: string) => {
        onChange(next);
        onEntityRefsChange(syncEntityRefsFromText(next, entityRefs));
      },
      [entityRefs, onChange, onEntityRefsChange],
    );

    const syncMirrorScroll = useCallback(() => {
      const ta = localRef.current;
      const mirror = mirrorRef.current;
      if (!ta || !mirror) return;
      mirror.scrollTop = ta.scrollTop;
      mirror.scrollLeft = ta.scrollLeft;
    }, []);

    const onUserCandidatesChange = useCallback((users: User[]) => {
      setUserCandidates(users);
      setHighlight(0);
    }, []);

    const onResourceCandidatesChange = useCallback((items: ResourceTagCandidate[]) => {
      setResourceCandidates(items);
      setHighlight(0);
    }, []);

    const moveHighlight = useCallback(
      (delta: number) => {
        setHighlight(i => {
          const list =
            activeTrigger === '@' ? userCandidates : resourceCandidates;
          if (list.length === 0) return 0;
          const n = list.length;
          return ((i + delta) % n + n) % n;
        });
      },
      [activeTrigger, resourceCandidates, userCandidates],
    );

    const selectHighlighted = useCallback(() => {
      if (activeTrigger === '@') {
        const u = userCandidates[highlight];
        if (u) {
          selectUser(u);
        }
      } else if (activeTrigger === '#') {
        const item = resourceCandidates[highlight];
        if (item) {
          selectResource(item);
        }
      }
    }, [
      activeTrigger,
      highlight,
      resourceCandidates,
      selectResource,
      selectUser,
      userCandidates,
    ]);

    const hasPickerCandidates =
      activeTrigger === '@'
        ? userCandidates.length > 0
        : activeTrigger === '#'
          ? resourceCandidates.length > 0
          : false;

    const handleKeyDown = useCallback(
      (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (activeAuto?.state.active && hasPickerCandidates) {
          const handled = activeAuto.handleKeyDown(e, {
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
        }

        if (e.key === 'Enter' && !e.shiftKey && onSubmit) {
          e.preventDefault();
          onSubmit();
          return;
        }

        onKeyDown?.(e);
      },
      [
        activeAuto,
        hasPickerCandidates,
        moveHighlight,
        onKeyDown,
        onSubmit,
        selectHighlighted,
      ],
    );

    const handleKeyUp = useCallback(
      (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        atAuto.onCaretChange();
        hashAuto.onCaretChange();
        onKeyUp?.(e);
      },
      [atAuto, hashAuto, onKeyUp],
    );

    const handleClick = useCallback(
      (e: React.MouseEvent<HTMLTextAreaElement>) => {
        atAuto.onCaretChange();
        hashAuto.onCaretChange();
        onClick?.(e);
      },
      [atAuto, hashAuto, onClick],
    );

    const handleScroll = useCallback(
      (e: React.UIEvent<HTMLTextAreaElement>) => {
        syncMirrorScroll();
        onScroll?.(e);
      },
      [onScroll, syncMirrorScroll],
    );

    const popoverAnchor = useMemo(() => {
      const el = localRef.current;
      if (!el || !activeAuto?.state.active) return null;
      return getMentionPopoverAnchor(el, activeAuto.state.caretIndex);
      // `activeAuto` subsumes its own state fields — listing them too cannot
      // change how often this recomputes.
    }, [activeAuto]);

    const previouslyTaggedAppIds = useMemo(() => {
      return entityRefs.filter(r => r.kind === 'app').map(r => r.id);
    }, [entityRefs]);

    const highlighted = useMemo(
      () => renderTaggedText(value, normalizeEntityRefs(entityRefs)),
      [value, entityRefs],
    );

    const textareaClass = ['taggable-composer-input', className].filter(Boolean).join(' ');

    return (
      <div className="taggable-composer-host relative min-w-0 flex-1" data-mention-host>
        <div
          ref={mirrorRef}
          className={`taggable-composer-mirror ${className}`}
          aria-hidden
        >
          {highlighted}
        </div>
        <textarea
          ref={localRef}
          value={value}
          onChange={e => handleValueChange(e.target.value)}
          onKeyDown={handleKeyDown}
          onKeyUp={handleKeyUp}
          onClick={handleClick}
          onScroll={handleScroll}
          className={textareaClass}
          {...rest}
          onFocus={handleFocus}
        />
        {activeTrigger === '@' && atAuto.state.active && popoverAnchor ? (
          <MentionPopover
            query={atAuto.state.query}
            position={popoverAnchor}
            highlightIndex={highlight}
            zIndex={CHAT_TAG_POPOVER_Z_INDEX}
            includeSelf
            onCandidatesChange={onUserCandidatesChange}
            onSelect={selectUser}
            onDismiss={atAuto.dismiss}
          />
        ) : null}
        {activeTrigger === '#' && hashAuto.state.active && popoverAnchor ? (
          <ResourceTagPopover
            query={hashAuto.state.query}
            position={popoverAnchor}
            highlightIndex={highlight}
            zIndex={CHAT_TAG_POPOVER_Z_INDEX}
            previouslyTaggedAppIds={previouslyTaggedAppIds}
            onCandidatesChange={onResourceCandidatesChange}
            onSelect={selectResource}
            onDismiss={hashAuto.dismiss}
          />
        ) : null}
      </div>
    );
  },
);
