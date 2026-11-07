import { useCallback, useEffect, useRef } from 'react';

/** Debounce keyword searches; semantic and hybrid searches are submitted explicitly. */
export function useLiveKeywordSearch(
  query: string,
  enabled: boolean,
  onSearch?: (query: string) => void,
) {
  const timer = useRef<number | undefined>(undefined);
  const lastSubmitted = useRef('');

  const submit = useCallback((value: string) => {
    window.clearTimeout(timer.current);
    lastSubmitted.current = value.trim();
    onSearch?.(value);
  }, [onSearch]);

  useEffect(() => {
    if (!enabled) {
      lastSubmitted.current = '';
      return;
    }
    const trimmed = query.trim();
    if (!trimmed) {
      lastSubmitted.current = '';
      return;
    }
    if (trimmed === lastSubmitted.current) return;
    timer.current = window.setTimeout(() => submit(query), 350);
    return () => window.clearTimeout(timer.current);
  }, [enabled, query, submit]);

  return submit;
}
