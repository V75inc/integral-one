/**
 * Phase 9 Plan 09-04 — frontend client + React Query hooks for
 * GET / PATCH /api/users/me/notification-preferences (NOTIF-03).
 *
 * Hand-mirrors backend/app/schemas/notification_preferences.py:
 *
 *   ChannelMatrix         — in_app / email / whatsapp booleans
 *   WhatsappPrefs         — opted_in_at + phone_e164 (only opted_in_at via OTP)
 *   NotificationKind      — "mention" | "share" | "agent_pending_write"
 *                           | "invitation" | "system" | "whatsapp_welcome"
 *   NotificationPreferences { channels, kinds, whatsapp }
 *
 * The five "user-facing" kinds visible in the section toggle matrix are
 * the first five — "whatsapp_welcome" is system-driven (fires once on
 * opt-in capture) and is intentionally hidden from the panel.
 *
 * useNotificationPreferences()  — React Query subscriber.
 * useUpdateNotificationPreferences() — mutation that hot-swaps the cache
 *                                       on success so the UI does not
 *                                       flash between optimistic state
 *                                       and refetch.
 *
 * The hook module also exports plain `fetchNotificationPreferences` and
 * `patchNotificationPreferences` functions so vitest can mock the network
 * boundary without spinning up a QueryClient transport.
 */
import {
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import apiClient from './client';

export type NotificationKind =
  | 'mention'
  | 'share'
  | 'agent_pending_write'
  | 'invitation'
  | 'system'
  | 'whatsapp_welcome'
  | 'entry_update';

export type ChannelName = 'in_app' | 'email' | 'whatsapp';

export interface ChannelMatrix {
  in_app: boolean;
  email: boolean;
  whatsapp: boolean;
}

export interface WhatsappPrefs {
  opted_in_at: string | null;
  phone_e164: string | null;
}

export interface NotificationPreferences {
  channels: ChannelMatrix;
  kinds: Partial<Record<NotificationKind, ChannelMatrix>>;
  whatsapp: WhatsappPrefs;
}

export const NOTIFICATION_PREFS_KEY = ['notification-preferences'] as const;

export async function fetchNotificationPreferences(): Promise<NotificationPreferences> {
  const { data } = await apiClient.get<NotificationPreferences>(
    '/users/me/notification-preferences',
  );
  return data;
}

export interface NotificationPreferencesPatch {
  channels?: Partial<ChannelMatrix>;
  kinds?: Partial<Record<NotificationKind, Partial<ChannelMatrix>>>;
  whatsapp?: { phone_e164?: string | null };
}

export async function patchNotificationPreferences(
  partial: NotificationPreferencesPatch,
): Promise<NotificationPreferences> {
  const { data } = await apiClient.patch<NotificationPreferences>(
    '/users/me/notification-preferences',
    partial,
  );
  return data;
}

export function useNotificationPreferences() {
  return useQuery<NotificationPreferences>({
    queryKey: NOTIFICATION_PREFS_KEY,
    queryFn: fetchNotificationPreferences,
  });
}

export function useUpdateNotificationPreferences() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: patchNotificationPreferences,
    onSuccess: data => {
      qc.setQueryData(NOTIFICATION_PREFS_KEY, data);
    },
  });
}
