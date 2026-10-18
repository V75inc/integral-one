import apiClient from './client';
import { fetchAllByCursor, hasExplicitPaging } from './pagination';
import { toArr } from './helpers';

export interface NotificationListResponse {
  notifications: unknown[];
  total: number;
  page: number;
  per_page: number;
  total_pages: number;
  unread_count: number;
}

export const notificationsApi = {
  list: async (
    params?: Record<string, unknown>
  ): Promise<NotificationListResponse> => {
    if (hasExplicitPaging(params)) {
      return apiClient
        .get('/notifications', { params })
        .then(r => {
          const payload = (r.data ?? {}) as Record<string, unknown>;
          return {
            notifications: toArr(payload),
            total: Number(payload.total ?? 0),
            page: Number(payload.page ?? 1),
            per_page: Number(payload.per_page ?? 0),
            total_pages: Number(payload.total_pages ?? 0),
            unread_count: Number(payload.unread_count ?? 0),
          };
        });
    }
    const notifications = await fetchAllByCursor('/notifications', params);
    return {
      notifications,
      total: notifications.length,
      page: 1,
      per_page: notifications.length,
      total_pages: 1,
      unread_count: notifications.filter(n => !(n as { read?: boolean }).read).length,
    };
  },
  markRead: (id: string) => apiClient.put(`/notifications/${id}/read`),
  markAllRead: () => apiClient.put('/notifications/mark-all-read'),
};
