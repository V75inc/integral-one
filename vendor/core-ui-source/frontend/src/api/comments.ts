import apiClient from './client';
import { unwrapResource } from './helpers';
import type { Comment } from '../types';

export const commentsApi = {
  update: (id: string, text: string) =>
    apiClient
      .put(`/comments/${id}`, { text })
      .then(r => unwrapResource<Comment>(r.data, 'comment')),
  delete: (id: string) => apiClient.delete(`/comments/${id}`),
};
