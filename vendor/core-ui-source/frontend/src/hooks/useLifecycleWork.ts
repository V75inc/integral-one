import { useEffect, useRef } from 'react';
import { workItemsApi } from '../api/workItems';

const TERMINAL_FAILURES = new Set([
  'failed',
  'cancelled',
  'expired',
  'dead_letter',
]);

function completedAppId(appId: string, resultRefs: string[]): string | null {
  if (appId) return appId;
  const ref = resultRefs.find(value => value.startsWith('app:'));
  return ref?.slice('app:'.length) || null;
}

/**
 * Observe a durable App lifecycle operation until the worker has a terminal
 * result. Observation errors are retried: they must never turn a live action
 * into a false failure in the interface.
 */
export function useLifecycleWork(
  workItemId: string | null,
  handlers: {
    onSucceeded: (appId: string) => void;
    onFailed: (message: string) => void;
  },
) {
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  useEffect(() => {
    if (!workItemId) return;
    let cancelled = false;
    let timer: number | undefined;

    const poll = async () => {
      try {
        const work = await workItemsApi.get(workItemId);
        if (cancelled) return;
        if (work.status === 'succeeded') {
          const appId = completedAppId(work.app_id, work.result_refs);
          if (appId) {
            handlersRef.current.onSucceeded(appId);
          } else {
            handlersRef.current.onFailed(
              'Lifecycle work completed without an App result.',
            );
          }
          return;
        }
        if (TERMINAL_FAILURES.has(work.status)) {
          handlersRef.current.onFailed(
            work.failure?.message || 'Lifecycle work did not complete.',
          );
          return;
        }
      } catch {
        // Keep polling the durable record after a transient observation error.
      }
      if (!cancelled) timer = window.setTimeout(poll, 1_500);
    };

    void poll();
    return () => {
      cancelled = true;
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [workItemId]);
}
