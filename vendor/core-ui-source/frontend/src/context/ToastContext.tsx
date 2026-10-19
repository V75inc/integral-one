import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useMemo,
  useRef,
  useEffect,
} from 'react';
import { Link } from 'react-router-dom';
import { Loader2, X } from 'lucide-react';
import { LINE_ICON_STROKE } from '../components/ui';
import { toToastMessage } from '../api/helpers';
import { useOverlayPresence } from '../hooks/useOverlayPresence';

type TType = 'success' | 'error' | 'info' | 'pending';

export interface ToastAction {
  label: string;
  href: string;
}

interface Toast {
  id: string;
  message: string;
  type: TType;
  action?: ToastAction;
}

/**
 * Public toast API.
 *
 * `showToast(message, type)` — fire-and-forget. Backwards-compatible
 *   with the original signature; the returned id can be ignored.
 *
 * `showPendingToast(message)` — opens a toast with a spinner and NO
 *   auto-dismiss timer. Returns an id callers MUST resolve via
 *   ``resolveToast(id, …)`` (or dismiss outright via ``dismissToast``)
 *   so the user isn't stuck looking at a hung indicator. Used by the
 *   optimistic-delete flow: shows "Deleting…" while the backend
 *   call is in flight, then flips to "Entry deleted" / "Failed".
 */
interface ToastCtx {
  showToast(
    message: string | unknown,
    type?: Exclude<TType, 'pending'>,
    action?: ToastAction,
  ): string;
  showPendingToast(message: string | unknown): string;
  resolveToast(
    id: string,
    message: string | unknown,
    type: Exclude<TType, 'pending'>,
    action?: ToastAction,
  ): void;
  dismissToast(id: string): void;
}
const Ctx = createContext<ToastCtx | null>(null);

const AUTO_DISMISS_MS = 5500;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const dismissTimersRef = useRef<Map<string, number>>(new Map());
  const remainingMsRef = useRef<Map<string, number>>(new Map());
  const timerStartedAtRef = useRef<Map<string, number>>(new Map());
  // Mini chat / modals register here. When any overlay is open, park toasts
  // in the opposite corner so they aren't buried under the chat panel
  // and don't cover the composer on desktop.
  const overlayCount = useOverlayPresence();
  const clearChatCorner = overlayCount > 0;

  const clearDismissTimer = useCallback((id: string) => {
    const timerId = dismissTimersRef.current.get(id);
    if (timerId !== undefined) {
      window.clearTimeout(timerId);
      dismissTimersRef.current.delete(id);
    }
  }, []);

  const clearDismissState = useCallback(
    (id: string) => {
      clearDismissTimer(id);
      remainingMsRef.current.delete(id);
      timerStartedAtRef.current.delete(id);
    },
    [clearDismissTimer],
  );

  const scheduleDismiss = useCallback(
    (id: string, delayMs: number = AUTO_DISMISS_MS) => {
      clearDismissTimer(id);
      remainingMsRef.current.set(id, delayMs);
      timerStartedAtRef.current.set(id, Date.now());
      const timerId = window.setTimeout(() => {
        clearDismissState(id);
        setToasts(p => p.filter(t => t.id !== id));
      }, delayMs);
      dismissTimersRef.current.set(id, timerId);
    },
    [clearDismissState, clearDismissTimer],
  );

  const pauseDismiss = useCallback(
    (id: string) => {
      const timerId = dismissTimersRef.current.get(id);
      if (timerId === undefined) return;
      window.clearTimeout(timerId);
      dismissTimersRef.current.delete(id);
      const startedAt = timerStartedAtRef.current.get(id) ?? Date.now();
      const elapsed = Date.now() - startedAt;
      const remaining = Math.max(
        0,
        (remainingMsRef.current.get(id) ?? AUTO_DISMISS_MS) - elapsed,
      );
      remainingMsRef.current.set(id, remaining);
    },
    [],
  );

  const resumeDismiss = useCallback(
    (id: string) => {
      const remaining = remainingMsRef.current.get(id);
      if (remaining === undefined) return;
      scheduleDismiss(id, remaining);
    },
    [scheduleDismiss],
  );

  useEffect(() => {
    const timers = dismissTimersRef.current;
    return () => {
      timers.forEach(timerId => window.clearTimeout(timerId));
      timers.clear();
    };
  }, []);

  const dismissToast = useCallback(
    (id: string) => {
      clearDismissState(id);
      setToasts(p => p.filter(t => t.id !== id));
    },
    [clearDismissState],
  );

  const showToast = useCallback(
    (
      message: string | unknown,
      type: Exclude<TType, 'pending'> = 'info',
      action?: ToastAction,
    ) => {
      const id = Math.random().toString(36).slice(2);
      const text = toToastMessage(message);
      setToasts(p => [...p, { id, message: text, type, action }]);
      scheduleDismiss(id);
      return id;
    },
    [scheduleDismiss],
  );

  const showPendingToast = useCallback((message: string | unknown) => {
    const id = Math.random().toString(36).slice(2);
    const text = toToastMessage(message);
    setToasts(p => [...p, { id, message: text, type: 'pending' }]);
    // No auto-dismiss — caller MUST resolve or dismiss.
    return id;
  }, []);

  const resolveToast = useCallback(
    (
      id: string,
      message: string | unknown,
      type: Exclude<TType, 'pending'>,
      action?: ToastAction,
    ) => {
      const text = toToastMessage(message);
      setToasts(p =>
        p.map(t => (t.id === id ? { ...t, message: text, type, action } : t)),
      );
      // Now that it's resolved, queue auto-dismiss.
      scheduleDismiss(id);
    },
    [scheduleDismiss],
  );
  const styles: Record<TType, string> = {
    success:
      'bg-[var(--success-fg)] text-white shadow-[var(--shadow-pop)]',
    error: 'bg-[var(--danger-fg)] text-white shadow-[var(--shadow-pop)]',
    info:
      'bg-[var(--panel)] text-[var(--text)] border border-[var(--panel-border)] border-l-4 border-l-[var(--brand-accent)] shadow-[var(--shadow-pop)]',
    // Pending uses the same chrome as info but with a spinner glyph
    // injected into the row below — no auto-dismiss until resolved.
    pending:
      'bg-[var(--panel)] text-[var(--text)] border border-[var(--panel-border)] border-l-4 border-l-[var(--brand-accent)] shadow-[var(--shadow-pop)]',
  };
  // Memoized: all four members are already useCallback-stable, but an inline
  // object literal here handed every consumer a fresh context value on each
  // provider render. That made `toast` unusable as a hook dependency — callers
  // had to omit it and eat the exhaustive-deps warning, or risk a refetch loop.
  const ctxValue = useMemo(
    () => ({ showToast, showPendingToast, resolveToast, dismissToast }),
    [showToast, showPendingToast, resolveToast, dismissToast],
  );

  return (
    <Ctx.Provider value={ctxValue}>
      {children}
      <div
        aria-live="polite"
        aria-atomic="false"
        /* `z-toast` is near the top of the ladder so toasts stay readable
           over the chat panel and dialogs on mobile full-bleed chat; on
           desktop we also flip to bottom-left while an overlay is open. */
        className={
          clearChatCorner
            ? 'fixed bottom-4 left-3 right-3 z-toast flex flex-col gap-2 pointer-events-none items-stretch md:left-5 md:right-auto md:bottom-5 md:items-start'
            : 'fixed bottom-4 left-3 right-3 z-toast flex flex-col gap-2 pointer-events-none items-stretch md:left-auto md:right-5 md:bottom-5 md:items-end'
        }
      >
        {toasts.map(t => (
          <div
            key={t.id}
            onMouseEnter={() => {
              if (t.type !== 'pending') pauseDismiss(t.id);
            }}
            onMouseLeave={() => {
              if (t.type !== 'pending') resumeDismiss(t.id);
            }}
            className={`flex items-center gap-3 px-4 py-3 rounded-[var(--radius-card)] text-sm font-medium animate-slide-up w-full md:w-auto md:max-w-sm pointer-events-auto ${styles[t.type]}`}
          >
            {t.type === 'pending' && (
              <Loader2
                size={14}
                strokeWidth={LINE_ICON_STROKE}
                className="shrink-0 animate-spin text-[var(--brand-accent)]"
                aria-hidden
              />
            )}
            <span className="min-w-0 flex-1 truncate" title={t.message}>{t.message}</span>
            {t.action ? (
              <Link
                to={t.action.href}
                onClick={() => dismissToast(t.id)}
                className="shrink-0 text-xs font-semibold underline underline-offset-2 opacity-90 hover:opacity-100"
              >
                {t.action.label}
              </Link>
            ) : null}
            <button
              type="button"
              onClick={() => dismissToast(t.id)}
              className="shrink-0 inline-flex items-center justify-center w-8 h-8 -mr-1 rounded-md opacity-70 hover:opacity-100 transition-opacity duration-fast"
              aria-label="Dismiss"
            >
              <X size={14} strokeWidth={LINE_ICON_STROKE} />
            </button>
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}
export function useToast() {
  const c = useContext(Ctx);
  if (!c) throw new Error('useToast outside ToastProvider');
  return c;
}
