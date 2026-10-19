import apiClient from './client';
import { toArr, unwrapResource } from './helpers';
import type { Tag } from '../types';

export const tagsApi = {
  list: async (params?: {
    track_id?: string;
    space_id?: string;
  }): Promise<Tag[]> => {
    const { data } = await apiClient.get('/tags', { params });
    return toArr(data) as Tag[];
  },
  create: (body: {
    name: string;
    color?: string;
    track_id?: string;
    space_id?: string;
  }) =>
    apiClient
      .post('/tags', body)
      .then(r => unwrapResource<Tag>(r.data, 'tag')),
  update: (id: string, body: { name?: string; color?: string }) =>
    apiClient
      .put(`/tags/${id}`, body)
      .then(r => unwrapResource<Tag>(r.data, 'tag')),
  delete: (id: string) => apiClient.delete(`/tags/${id}`),
};
