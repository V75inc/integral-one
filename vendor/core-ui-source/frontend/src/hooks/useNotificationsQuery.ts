/**
 * Phase 9 Plan 09-02 (NOTIF-01) — back-compat shim.
 *
 * The canonical hook is ``useNotifications()`` (frontend/src/hooks/useNotifications.ts).
 * Every consumer surface in the app (NotificationsPage, NotificationsHeaderButton,
 * MissionControlPage) was migrated to ``useNotifications`` in this plan; this
 * shim is preserved so any out-of-tree consumer (third-party plugin, fork)
 * or grep-target import path continues to resolve.
 *
 * Re-exports both the function under its prior name and the shared query key
 * constant. New code MUST import from ``./useNotifications`` directly.
 */
export {
  NOTIFICATIONS_QUERY_KEY,
  useNotifications as useNotificationsQuery,
} from './useNotifications';
