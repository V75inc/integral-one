import { useEffect, useRef } from 'react';

import { useChatPageFocus } from '../context/ChatPageFocusContext';
import type { ChatPageContextPartial } from '../context/ChatPageFocusContext';

/**
 * Tell the assistant what this page is showing.
 *
 * Publishing is a `useEffect` plus a clear-on-unmount, repeated per page. Done
 * by hand that is three chances to get it wrong — a missing cleanup leaks the
 * previous page's context into the next one, so the agent answers "what am I
 * looking at" with a screen the user already left. This owns the lifecycle so
 * a page only has to describe itself.
 *
 * Pass `null` when there is nothing meaningful to publish yet (still loading,
 * or no id in the route); the previous context is cleared rather than left
 * stale.
 *
 * **Do not publish anything you would not show the agent.** The snapshot is
 * sent to the backend with the turn: names, ids, counts and statuses are the
 * point; emails, tokens, keys and message bodies are not.
 */
export function usePublishPageContext(
  context: ChatPageContextPartial | null,
): void {
  const { setPageContext, clearPageContext } = useChatPageFocus();

  // Callers build the object inline, so its identity changes every render.
  // Comparing the serialized form keeps the effect from re-firing on every
  // keystroke, and the payload is small by contract (visible lists are capped
  // at MAX_VISIBLE_CONTEXT_ITEMS before they reach the wire).
  const serialized = context ? JSON.stringify(context) : null;
  const latest = useRef(context);
  latest.current = context;

  useEffect(() => {
    if (!latest.current) {
      clearPageContext();
      return;
    }
    setPageContext(latest.current);
    return () => clearPageContext();
  }, [serialized, setPageContext, clearPageContext]);
}
