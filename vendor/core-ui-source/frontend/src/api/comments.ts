import apiClient from './client';
import { unwrapResource } from './helpers';
import type { Comment } from '../types';

export const commentsApi = {
  selectReaction: (id: string, emoji: string) =>
    apiClient.put(`/comments/${id}/reactions`, { emoji }).then(r => r.data),
  removeReaction: (id: string, emoji: string) =>
    apiClient.delete(`/comments/${id}/reactions/${encodeURIComponent(emoji)}`).then(r => r.data),
  update: (id: string, text: string) =>
    apiClient
      .put(`/comments/${id}`, { text })
      .then(r => unwrapResource<Comment>(r.data, 'comment')),
  delete: (id: string) => apiClient.delete(`/comments/${id}`),
};
