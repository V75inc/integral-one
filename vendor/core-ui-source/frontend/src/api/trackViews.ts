import apiClient from './client';
import { unwrapResource } from './helpers';
import type { SavedView } from '../types';

export const trackViewsApi = {
  list: async (trackId: string): Promise<SavedView[]> => {
    const { data } = await apiClient.get(`/tracks/${trackId}/views`);
    const views = (data as { views?: SavedView[] })?.views;
    return Array.isArray(views) ? views : [];
  },
  create: (
    trackId: string,
    body: {
      name: string;
      type?: string;
      config?: Record<string, unknown>;
      is_default?: boolean;
    }
  ) =>
    apiClient
      .post(`/tracks/${trackId}/views`, body)
      .then(r => unwrapResource<SavedView>(r.data, 'view')),
  get: (viewId: string) =>
    apiClient
      .get(`/views/${viewId}`)
      .then(r => unwrapResource<SavedView>(r.data, 'view')),
  update: (
    viewId: string,
    body: {
      name?: string;
      type?: string;
      config?: Record<string, unknown>;
      is_default?: boolean;
      hidden?: boolean;
      entry_type_keys?: string[];
      default_entry_type_key?: string;
    }
  ) =>
    apiClient
      .put(`/views/${viewId}`, body)
      .then(r => unwrapResource<SavedView>(r.data, 'view')),
  delete: (viewId: string) => apiClient.delete(`/views/${viewId}`),
};
