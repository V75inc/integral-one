import { useEffect, useState } from 'react';

/**
 * Tiny global overlay-presence registry.
 *
 * Any component rendering a viewport-blocking overlay (modal, sheet,
 * confirm dialog) registers itself for its open lifetime. The counter
 * supports nested overlays; consumers may subscribe via
 * `useOverlayPresence()` if they need to react to overlay depth.
 *
 * Implementation notes:
 *   - Module-level state, not React context: avoids forcing every
 *     overlay producer to thread a provider down its tree.
 *   - Counter (not boolean) so nested overlays stack cleanly.
 *   - Lightweight subscriber list with a Set + manual event emission.
 *     `useSyncExternalStore` would be slightly nicer but requires
 *     React 18+ semantics; this hook is React 18 anyway, but the Set
 *     pattern is explicit and trivially debuggable.
 */
let openCount = 0;
const subscribers = new Set<(n: number) => void>();

function emit() {
  for (const fn of subscribers) fn(openCount);
}

function acquire(): () => void {
  openCount += 1;
  emit();
  let released = false;
  return () => {
    if (released) return;
    released = true;
    openCount = Math.max(0, openCount - 1);
    emit();
  };
}

/** Reactive read — returns the current count and re-renders the caller
 *  whenever it changes. Use `count > 0` to detect "any overlay open". */
export function useOverlayPresence(): number {
  const [count, setCount] = useState(openCount);
  useEffect(() => {
    subscribers.add(setCount);
    setCount(openCount);
    return () => {
      subscribers.delete(setCount);
    };
  }, []);
  return count;
}

/** Register the calling component as an overlay producer for as long as
 *  `open` is truthy. Designed for direct inclusion in a dialog body:
 *  the caller doesn't have to thread setup/teardown manually. */
export function useRegisterOverlay(open: boolean): void {
  useEffect(() => {
    if (!open) return undefined;
    return acquire();
  }, [open]);
}
