import { useEffect } from 'react';

/** Poll after completion, only while visible. Slow reads never stack timers. */
export function useSerialPolling(
  read: () => Promise<unknown>,
  intervalMs: number,
  enabled = true,
): void {
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    let running = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const schedule = () => {
      if (!cancelled && document.visibilityState !== 'hidden') {
        timer = setTimeout(() => { void poll(); }, intervalMs);
      }
    };
    const poll = async () => {
      if (cancelled || running || document.visibilityState === 'hidden') return;
      running = true;
      try { await read(); } catch { /* Next scheduled read may recover. */ }
      finally { running = false; schedule(); }
    };
    const visibility = () => {
      clearTimeout(timer);
      if (document.visibilityState !== 'hidden') void poll();
    };
    schedule();
    document.addEventListener('visibilitychange', visibility);
    return () => {
      cancelled = true;
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', visibility);
    };
  }, [read, intervalMs, enabled]);
}
