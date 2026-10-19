/**
 * SystemNotificationsContext — programmatic critical-message bar.
 *
 * Top-of-page banner system for application-wide notifications that deserve
 * more prominence than a toast: email verification, server-unreachable
 * states, scheduled-maintenance windows, app-update prompts, etc.
 *
 * Usage:
 *   const { notify, dismiss, update } = useSystemNotifications();
 *   const id = notify({
 *     type: 'warning',
 *     title: 'Unable to reach Integral',
 *     body: 'Reconnecting…',
 *     dismissible: false,
 *   });
 *   // later
 *   dismiss(id);
 *
 * One bar visible at a time. The highest-priority active notification wins;
 * remaining notifications queue and slide in when their turn comes. Each
 * `type` has a default priority (error > warning > info > success); callers
 * can override with `priority`.
 *
 * Auto-dismiss (`autoDismissMs`) is opt-in — system bars are usually
 * persistent until the underlying condition clears.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type { LucideIcon } from 'lucide-react';

export type SystemNotificationType = 'info' | 'warning' | 'error' | 'success';

export interface SystemNotificationAction {
  /** Visible label of the inline action button. */
  label: string;
  /** Click handler. May be async — the button shows a busy state while pending. */
  onClick: () => void | Promise<void>;
  /** Optional sticky busy state controlled by the caller. */
  busy?: boolean;
}

export interface SystemNotification {
  id: string;
  type: SystemNotificationType;
  /** Bold leading title (e.g. "Verify your email"). */
  title: string;
  /** Optional plain-text body after the title separator. */
  body?: string;
  /** Inline action buttons rendered after the body (Resend code / Retry / etc.). */
  actions?: SystemNotificationAction[];
  /** Whether the user can dismiss with the close button. Default true. */
  dismissible?: boolean;
  /** Called only when the user closes the banner, not when its condition clears. */
  onUserDismiss?: () => void;
  /** Custom icon. Defaults are selected by type. */
  icon?: LucideIcon;
  /** If set, auto-dismiss after N ms. Omit for persistent bars. */
  autoDismissMs?: number;
  /** Sort priority — higher shows first. Default determined by type. */
  priority?: number;
  /** Called by the provider AFTER the notification is removed (any reason). */
  onDismiss?: () => void;
}

export type SystemNotificationInput =
  Omit<SystemNotification, 'id'> & { id?: string };

export interface SystemNotificationsApi {
  /**
   * Push a notification. Returns its id. If you supply `id` and a
   * notification with that id already exists, it's replaced (useful for
   * `connection-status`-style singleton notifications that update in place).
   */
  notify: (n: SystemNotificationInput) => string;
  /** Remove a notification by id. No-op if missing. */
  dismiss: (id: string) => void;
  /** Patch an existing notification in place. No-op if missing. */
  update: (id: string, patch: Partial<Omit<SystemNotification, 'id'>>) => void;
  /** Remove every notification. */
  clear: () => void;
}

interface ContextValue extends SystemNotificationsApi {
  /** The highest-priority active notification, or null. */
  current: SystemNotification | null;
}

const PRIORITY_BY_TYPE: Record<SystemNotificationType, number> = {
  error: 100,
  warning: 75,
  info: 50,
  success: 25,
};

const Context = createContext<ContextValue | null>(null);

/** Public hook — call from anywhere under SystemNotificationsProvider. */
export function useSystemNotifications(): SystemNotificationsApi {
  const ctx = useContext(Context);
  if (!ctx) {
    throw new Error(
      'useSystemNotifications must be used inside <SystemNotificationsProvider>',
    );
  }
  return ctx;
}

/** Internal — used by SystemNotificationBar to read the current item. */
export function useSystemNotificationCurrent(): SystemNotification | null {
  const ctx = useContext(Context);
  return ctx?.current ?? null;
}

let _seq = 0;
const nextId = () => `sn_${++_seq}_${Date.now().toString(36)}`;

/**
 * Module-level handle to the live notification API.
 * Lets non-React modules (axios interceptor, service workers, error
 * boundaries) call notify/dismiss without a hook. Set by the provider on
 * mount; null when no provider mounted yet.
 */
let _liveApi: SystemNotificationsApi | null = null;

/** Non-React access to the notification API. Returns null if no provider mounted. */
export function getSystemNotificationsApi(): SystemNotificationsApi | null {
  return _liveApi;
}

export function SystemNotificationsProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<SystemNotification[]>([]);
  const onDismissRefs = useRef(new Map<string, () => void>());

  const notify = useCallback((n: SystemNotificationInput): string => {
    const id = n.id ?? nextId();
    if (n.onDismiss) onDismissRefs.current.set(id, n.onDismiss);
    setItems((prev) => {
      const without = prev.filter((x) => x.id !== id);
      return [...without, { ...n, id }];
    });
    return id;
  }, []);

  const dismiss = useCallback((id: string) => {
    setItems((prev) => {
      const found = prev.find((x) => x.id === id);
      if (!found) return prev;
      const cb = onDismissRefs.current.get(id);
      if (cb) {
        onDismissRefs.current.delete(id);
        // Defer so React commits the removal before user callbacks run.
        queueMicrotask(cb);
      }
      return prev.filter((x) => x.id !== id);
    });
  }, []);

  const update = useCallback(
    (id: string, patch: Partial<Omit<SystemNotification, 'id'>>) => {
      setItems((prev) =>
        prev.map((x) => (x.id === id ? { ...x, ...patch, id } : x)),
      );
    },
    [],
  );

  const clear = useCallback(() => {
    onDismissRefs.current.forEach((cb) => queueMicrotask(cb));
    onDismissRefs.current.clear();
    setItems([]);
  }, []);

  // Auto-dismiss timers — one per item that opted in.
  useEffect(() => {
    const timers: number[] = [];
    for (const item of items) {
      if (item.autoDismissMs && item.autoDismissMs > 0) {
        const id = window.setTimeout(() => dismiss(item.id), item.autoDismissMs);
        timers.push(id);
      }
    }
    return () => timers.forEach((t) => clearTimeout(t));
  }, [items, dismiss]);

  // Highest-priority item wins. Stable tiebreaker = insertion order.
  const current = useMemo(() => {
    if (items.length === 0) return null;
    let best = items[0];
    let bestP = best.priority ?? PRIORITY_BY_TYPE[best.type];
    for (let i = 1; i < items.length; i++) {
      const x = items[i];
      const p = x.priority ?? PRIORITY_BY_TYPE[x.type];
      if (p > bestP) {
        best = x;
        bestP = p;
      }
    }
    return best;
  }, [items]);

  const value = useMemo<ContextValue>(
    () => ({ notify, dismiss, update, clear, current }),
    [notify, dismiss, update, clear, current],
  );

  // Publish the live API so non-React modules can call notify/dismiss.
  useEffect(() => {
    _liveApi = { notify, dismiss, update, clear };
    return () => { _liveApi = null; };
  }, [notify, dismiss, update, clear]);

  return <Context.Provider value={value}>{children}</Context.Provider>;
}
