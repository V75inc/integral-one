import { useMemo } from 'react';

/** Coalesce overlapping reads for one callback/scope, including manual refreshes. */
export function useSingleFlight<Args extends unknown[], Result>(
  callback: (...args: Args) => Promise<Result>,
  trailing = false,
): (...args: Args) => Promise<Result> {
  return useMemo(() => {
    let pending: Promise<Result> | undefined;
    let queued: Args | undefined;
    return (...args: Args) => {
      if (pending) {
        if (trailing) queued = args;
        return pending;
      }
      pending = (async () => {
        let current = args;
        let result: Result;
        do {
          queued = undefined;
          result = await callback(...current);
          current = queued ?? current;
        } while (queued);
        return result;
      })().finally(() => { pending = undefined; });
      return pending;
    };
  }, [callback, trailing]);
}
