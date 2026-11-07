import apiClient from './client';
import { unwrapApiDataEnvelope, toArr } from './helpers';

export type ResourceKind = 'app' | 'track';
export type ExportMode = 'configuration' | 'full';
export type TransferSummary = {
  kind: ResourceKind; mode: ExportMode; names: string[];
  apps: number; tracks: number; entries: number; attachments: number;
  resource_ids?: string[];
};

export const portableApi = {
  list: async (kind: ResourceKind, cursor?: string, appId?: string) => {
    const { data } = await apiClient.get(kind === 'app' ? '/apps' : '/tracks', {
      params: { limit: 50, cursor, include_nav_hidden: true, ...(appId ? { app_id: appId } : {}) },
    });
    const inner = unwrapApiDataEnvelope(data);
    return {
      items: (toArr(inner) as Array<{ id: string; name?: string; title?: string }>),
      cursor: inner.has_more && typeof inner.next_cursor === 'string' ? inner.next_cursor : undefined,
    };
  },
  export: async (kind: ResourceKind, ids: string[], mode: ExportMode) => {
    const { data } = await apiClient.post('/portable/export', { kind, ids, mode }, { responseType: 'blob', timeout: 120000 });
    return data as Blob;
  },
  preview: async (file: File): Promise<TransferSummary> => {
    const { data } = await apiClient.post('/portable/preview', file, { headers: { 'Content-Type': 'application/zip' }, timeout: 120000 });
    return unwrapApiDataEnvelope(data) as TransferSummary;
  },
  import: async (file: File, appId?: string): Promise<TransferSummary> => {
    const { data } = await apiClient.post('/portable/import', file, {
      params: appId ? { app_id: appId } : {}, headers: { 'Content-Type': 'application/zip' }, timeout: 120000,
    });
    return unwrapApiDataEnvelope(data) as TransferSummary;
  },
};
