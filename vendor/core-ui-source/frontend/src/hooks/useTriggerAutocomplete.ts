/**
 * useTriggerAutocomplete — parameterized @ / # trigger autocomplete.
 *
 * Generalizes mention autocomplete for chat tagging and comments.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

export interface TriggerAutocompleteState {
  active: boolean;
  query: string;
  triggerIndex: number;
  caretIndex: number;
}

export interface UseTriggerAutocompleteOptions<T = unknown> {
  trigger: string;
  value: string;
  onChange: (next: string) => void;
  hostRef: React.RefObject<HTMLTextAreaElement | HTMLInputElement | null>;
  /**
   * Build the token inserted on selection (without trigger char).
   *
   * Parameterized on T so a caller of `useTriggerAutocomplete<User>` may pass
   * `(user: User) => string`. Typing it `(item: unknown) => string` made every
   * concrete callback un-assignable under `strictFunctionTypes`, since
   * accepting `unknown` is a weaker contract than accepting `User`.
   */
  buildToken: (item: T) => string;
}

export interface UseTriggerAutocompleteResult<T = unknown> {
  state: TriggerAutocompleteState;
  onCaretChange: () => void;
  handleKeyDown: (
    e: React.KeyboardEvent<HTMLTextAreaElement | HTMLInputElement>,
    handlers: {
      onArrowDown?: () => void;
      onArrowUp?: () => void;
      onEnter?: () => void;
      onTab?: () => void;
    },
  ) => boolean;
  replaceWithSelection: (item: T) => string | undefined;
  dismiss: () => void;
}

export function slugForTagToken(label: string): string {
  return (label || '').trim().replace(/\s+/g, '_');
}

export function useTriggerAutocomplete<T>({
  trigger,
  value,
  onChange,
  hostRef,
  buildToken,
}: UseTriggerAutocompleteOptions<T>): UseTriggerAutocompleteResult<T> {
  const [state, setState] = useState<TriggerAutocompleteState>({
    active: false,
    query: '',
    triggerIndex: -1,
    caretIndex: -1,
  });
  const suppressedUntilRef = useRef<number>(0);

  const computeAtCaret = useCallback(() => {
    const el = hostRef.current;
    if (!el) {
      setState(s => (s.active ? { ...s, active: false } : s));
      return;
    }
    const caret =
      typeof el.selectionStart === 'number' ? el.selectionStart : -1;
    if (caret < 0) {
      setState(s => (s.active ? { ...s, active: false } : s));
      return;
    }
    if (suppressedUntilRef.current && Date.now() < suppressedUntilRef.current) {
      return;
    }
    let i = caret - 1;
    let foundTrigger = -1;
    while (i >= 0) {
      const ch = value[i];
      if (ch === trigger) {
        if (i === 0 || /\s/.test(value[i - 1])) {
          foundTrigger = i;
        }
        break;
      }
      if (/\s/.test(ch)) break;
      i -= 1;
    }
    if (foundTrigger < 0) {
      setState(s => (s.active ? { ...s, active: false } : s));
      return;
    }
    const query = value.slice(foundTrigger + 1, caret);
    if (/\s/.test(query)) {
      setState(s => (s.active ? { ...s, active: false } : s));
      return;
    }
    setState({
      active: true,
      query,
      triggerIndex: foundTrigger,
      caretIndex: caret,
    });
  }, [hostRef, trigger, value]);

  useEffect(() => {
    computeAtCaret();
  }, [value, computeAtCaret]);

  const dismiss = useCallback(() => {
    setState(s => (s.active ? { ...s, active: false } : s));
  }, []);

  const replaceWithSelection = useCallback(
    (item: T): string | undefined => {
      const el = hostRef.current;
      const triggerIdx = state.triggerIndex;
      const caret = state.caretIndex;
      if (!el || triggerIdx < 0 || caret < 0) return undefined;
      const tokenBody = buildToken(item);
      if (!tokenBody) return undefined;
      const before = value.slice(0, triggerIdx);
      const after = value.slice(caret);
      const inserted = `${trigger}${tokenBody} `;
      const next = `${before}${inserted}${after}`;
      onChange(next);
      suppressedUntilRef.current = Date.now() + 100;
      setState({
        active: false,
        query: '',
        triggerIndex: -1,
        caretIndex: -1,
      });
      const nextCaret = (before + inserted).length;
      requestAnimationFrame(() => {
        const host = hostRef.current;
        if (!host) return;
        host.focus();
        try {
          host.setSelectionRange(nextCaret, nextCaret);
        } catch {
          /* read-only hosts */
        }
      });
      return next;
    },
    [buildToken, hostRef, onChange, state.caretIndex, state.triggerIndex, trigger, value],
  );

  const handleKeyDown = useCallback(
    (
      e: React.KeyboardEvent<HTMLTextAreaElement | HTMLInputElement>,
      handlers: {
        onArrowDown?: () => void;
        onArrowUp?: () => void;
        onEnter?: () => void;
        onTab?: () => void;
      },
    ): boolean => {
      if (!state.active) return false;
      switch (e.key) {
        case 'ArrowDown':
          handlers.onArrowDown?.();
          return true;
        case 'ArrowUp':
          handlers.onArrowUp?.();
          return true;
        case 'Enter':
          if (handlers.onEnter) {
            handlers.onEnter();
            return true;
          }
          return false;
        case 'Tab':
          if (handlers.onTab) {
            handlers.onTab();
            return true;
          }
          return false;
        case 'Escape':
          dismiss();
          return true;
        default:
          return false;
      }
    },
    [dismiss, state.active],
  );

  return useMemo(
    () => ({
      state,
      onCaretChange: computeAtCaret,
      handleKeyDown,
      replaceWithSelection,
      dismiss,
    }),
    [computeAtCaret, dismiss, handleKeyDown, replaceWithSelection, state],
  );
}
