import apiClient from './client';
import { unwrapResource } from './helpers';

export interface LinkPreviewRecord {
  url: string;
  title?: string;
  description?: string;
  image?: string;
  site_name?: string;
}

export const linkPreviewApi = {
  get: async (url: string): Promise<LinkPreviewRecord> => {
    const { data } = await apiClient.get('/link-preview', { params: { url } });
    return unwrapResource<LinkPreviewRecord>(data, 'preview');
  },
};
