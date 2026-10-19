import type { AxiosProgressEvent } from 'axios';
import apiClient from './client';
import { toArr, unwrapResource } from './helpers';

/**
 * Phase 1 + 1.5 (Plan 03) shape.
 *
 * Fields beyond the original CRUD set come from the new attachment
 * pipeline: ``content_hash`` lets the client identify duplicates,
 * ``scan_status`` exposes the malware-scanner verdict (clean/blocked/
 * skipped/...), ``metadata`` carries the queryable extracted metadata
 * (PDF page count, EXIF, etc.), and ``thumb_url`` / ``preview_url``
 * resolve to the cached image thumbnail and server-rendered PDF
 * preview respectively. All new fields are optional so list responses
 * from older backends still type-check.
 */
export interface AttachmentRecord {
  id: string;
  filename: string;
  mime_type?: string;
  size?: number;
  storage_key?: string;
  source_type?: 'file' | 'url' | string;
  external_url?: string;
  uploaded_by?: string;
  created_at?: string;
  // Phase 1 hardening
  content_hash?: string;
  scan_status?:
    | 'pending'
    | 'clean'
    | 'blocked'
    | 'skipped'
    | 'failed'
    | string;
  scan_engine?: string;
  scan_message?: string;
  // Derived
  width?: number | null;
  height?: number | null;
  page_count?: number | null;
  thumb_storage_key?: string;
  preview_storage_key?: string;
  // Phase 1.5 metadata pipeline
  metadata?: { common?: Record<string, unknown>; type_specific?: Record<string, unknown> };
  extracted_text?: string;
  metadata_status?:
    | 'pending'
    | 'processing'
    | 'complete'
    | 'partial'
    | 'failed'
    | 'skipped'
    | string;
  metadata_extractor_version?: number;
  metadata_error?: string;
  // Resolved URLs (populated by the GET endpoints).
  download_url?: string;
  thumb_url?: string | null;
  preview_url?: string | null;
}

export interface AttachmentDetailResponse {
  attachment: AttachmentRecord;
  download_url?: string;
  thumb_url?: string | null;
  preview_url?: string | null;
}

export interface AttachmentBatchResult {
  results: Array<
    | { attachment: AttachmentRecord }
    | { error: string; filename?: string }
  >;
  summary: { total: number; succeeded: number; failed: number };
  message?: string;
}

export type UploadProgressCallback = (event: AxiosProgressEvent) => void;

/** Flatten export_node attachment shapes for UI (id may live on ``context``). */
export function normalizeAttachment(raw: unknown): AttachmentRecord {
  // The backend's export_node helper may return either a flat shape or
  // a ``{id, context: {...fields}}`` envelope depending on the route.
  // Flatten both into our typed shape so the UI never has to branch.
  if (!raw || typeof raw !== 'object') {
    return { id: '', filename: '' };
  }
  const r = raw as Record<string, unknown>;
  const ctx =
    r.context && typeof r.context === 'object'
      ? (r.context as Record<string, unknown>)
      : {};
  const merged = { ...ctx, ...r } as Record<string, unknown>;
  return merged as unknown as AttachmentRecord;
}

function normalizeAttachmentList(raw: unknown[]): AttachmentRecord[] {
  return raw.map(normalizeAttachment);
}

// Core's default per-request batch cap (ATTACHMENT_MAX_BATCH_FILES). Past this,
// files go one at a time rather than being refused.
const BATCH_FILE_LIMIT = 10;

export const attachmentsApi = {
  listForEntry: async (entryId: string): Promise<AttachmentRecord[]> => {
    const { data } = await apiClient.get(`/entries/${entryId}/attachments`);
    return normalizeAttachmentList(toArr(data) as unknown[]);
  },

  uploadForEntry: async (
    entryId: string,
    file: File,
    options: { onUploadProgress?: UploadProgressCallback; signal?: AbortSignal } = {}
  ): Promise<AttachmentRecord> => {
    const form = new FormData();
    form.append('file', file);
    // Let the runtime set multipart boundary; overriding Content-Type
    // breaks uploads in some browsers (notably Safari).
    const { data } = await apiClient.post(
      `/entries/${entryId}/attachments`,
      form,
      {
        onUploadProgress: options.onUploadProgress,
        signal: options.signal,
      }
    );
    return normalizeAttachment(unwrapResource(data, 'attachment'));
  },

  /**
   * Upload a general (non-image) file to a chat thread (Slice B — general
   * file persistence). The returned attachment id is referenced on the
   * next ``SendMessageRequest.attachment_ids``.
   */
  uploadForChatThread: async (
    threadId: string,
    file: File,
    options: { onUploadProgress?: UploadProgressCallback; signal?: AbortSignal } = {}
  ): Promise<AttachmentRecord> => {
    const form = new FormData();
    form.append('file', file);
    const { data } = await apiClient.post(
      `/chat/threads/${threadId}/attachments`,
      form,
      {
        onUploadProgress: options.onUploadProgress,
        signal: options.signal,
      }
    );
    return normalizeAttachment(unwrapResource(data, 'attachment'));
  },

  /**
   * Batch upload: posts multiple files in a single multipart request.
   * The server returns per-file outcomes so partial success is allowed
   * (e.g. one file rejected as a duplicate hash while the rest land).
   */
  batchUploadForEntry: async (
    entryId: string,
    files: File[],
    options: { onUploadProgress?: UploadProgressCallback; signal?: AbortSignal } = {}
  ): Promise<AttachmentBatchResult> => {
    const form = new FormData();
    files.forEach((file) => form.append('files', file));
    const { data } = await apiClient.post(
      `/entries/${entryId}/attachments/batch`,
      form,
      {
        onUploadProgress: options.onUploadProgress,
        signal: options.signal,
      }
    );
    const raw = (data ?? {}) as Record<string, unknown>;
    const results = Array.isArray(raw.results)
      ? (raw.results as Array<Record<string, unknown>>).map((r) => {
          if (r.attachment) {
            return { attachment: normalizeAttachment(r.attachment) };
          }
          return {
            error: String(r.error ?? 'Upload failed'),
            filename:
              typeof r.filename === 'string' ? r.filename : undefined,
          };
        })
      : [];
    const summary = (raw.summary as AttachmentBatchResult['summary']) ?? {
      total: files.length,
      succeeded: 0,
      failed: files.length,
    };
    return {
      results,
      summary,
      message: typeof raw.message === 'string' ? raw.message : undefined,
    };
  },

  createUrlForEntry: async (
    entryId: string,
    url: string,
    label?: string
  ): Promise<AttachmentRecord> => {
    const { data } = await apiClient.post(`/entries/${entryId}/attachments/url`, {
      url,
      label,
    });
    return normalizeAttachment(unwrapResource(data, 'attachment'));
  },

  get: async (attachmentId: string): Promise<AttachmentDetailResponse> => {
    const { data } = await apiClient.get(`/attachments/${attachmentId}`);
    const raw = (data ?? {}) as Record<string, unknown>;
    return {
      attachment: normalizeAttachment(unwrapResource(data, 'attachment')),
      download_url:
        typeof raw.download_url === 'string' ? raw.download_url : undefined,
      thumb_url:
        typeof raw.thumb_url === 'string' ? raw.thumb_url : null,
      preview_url:
        typeof raw.preview_url === 'string' ? raw.preview_url : null,
    };
  },

  fetchDownloadBlob: async (
    attachmentId: string
  ): Promise<{ blob: Blob; contentType: string }> => {
    const response = await apiClient.get(`/attachments/${attachmentId}/download`, {
      responseType: 'blob',
      // The caller surfaces its own download-specific toast on failure, so
      // don't ALSO fire the generic "Request failed" system bar.
      __suppressSystemNotify: true,
    } as Parameters<typeof apiClient.get>[1]);
    return {
      blob: response.data as Blob,
      contentType: String(response.headers['content-type'] || ''),
    };
  },

  fetchThumbBlob: async (
    attachmentId: string
  ): Promise<{ blob: Blob; contentType: string } | null> => {
    try {
      const response = await apiClient.get(
        `/attachments/${attachmentId}/thumb`,
        { responseType: 'blob' }
      );
      return {
        blob: response.data as Blob,
        contentType: String(response.headers['content-type'] || ''),
      };
    } catch {
      return null;
    }
  },

  fetchPreviewBlob: async (
    attachmentId: string
  ): Promise<{ blob: Blob; contentType: string } | null> => {
    try {
      const response = await apiClient.get(
        `/attachments/${attachmentId}/preview`,
        { responseType: 'blob' }
      );
      return {
        blob: response.data as Blob,
        contentType: String(response.headers['content-type'] || ''),
      };
    } catch {
      return null;
    }
  },

  /**
   * Re-run metadata extraction for an attachment. Useful when an
   * earlier extraction failed (e.g. before libmagic was installed) or
   * when the extractor schema has been bumped.
   */
  reprocess: async (attachmentId: string): Promise<AttachmentRecord> => {
    const { data } = await apiClient.post(
      `/attachments/${attachmentId}/reprocess`
    );
    return normalizeAttachment(unwrapResource(data, 'attachment'));
  },

  delete: (attachmentId: string) => apiClient.delete(`/attachments/${attachmentId}`),

  /**
   * Resumable chunked upload (Plan 03 — Phase 6).
   *
   * The client decides at call time whether to use chunked or
   * single-request multipart based on a size threshold. When the
   * server has chunked uploads disabled (CHUNKED_UPLOAD_ENABLED=false),
   * the init request returns a 4xx and we transparently fall back to
   * the regular upload path so calling code doesn't have to branch.
   *
   * Returns the final AttachmentRecord. The progress callback receives
   * cumulative byte counts so the caller can render a single progress
   * bar across the whole file.
   */
  chunkedUploadForEntry: async (
    entryId: string,
    file: File,
    options: {
      onProgress?(loaded: number, total: number): void;
      chunkSize?: number;
      signal?: AbortSignal;
    } = {}
  ): Promise<AttachmentRecord> => {
    const chunkSize = options.chunkSize ?? 8 * 1024 * 1024; // 8 MiB default

    // Init session
    let session: ChunkedUploadSession;
    try {
      // The server reads these from the JSON body, not the query string.
      const { data } = await apiClient.post(
        `/entries/${entryId}/uploads`,
        {
          filename: file.name,
          total_bytes: file.size,
          mime_type: file.type || 'application/octet-stream',
          chunk_size: chunkSize,
        },
        { signal: options.signal }
      );
      session = (data as { session: ChunkedUploadSession }).session;
    } catch (e) {
      // Server may have chunked disabled — fall back to single shot.
      const status = (e as { response?: { status?: number } })?.response?.status;
      if (status === 400 || status === 503) {
        return attachmentsApi.uploadForEntry(entryId, file, {
          onUploadProgress: (event) => {
            if (event.total && options.onProgress) {
              options.onProgress(event.loaded, event.total);
            }
          },
          signal: options.signal,
        });
      }
      throw e;
    }

    // Drive chunks in order. The server tolerates out-of-order
    // appends but in-order is simpler and lets the running hash stay
    // valid for the dedup check.
    const totalChunks = Math.ceil(file.size / chunkSize);
    let uploaded = session.received_bytes;
    const startIndex = session.next_chunk_index;
    for (let i = startIndex; i < totalChunks; i += 1) {
      const start = i * chunkSize;
      const end = Math.min(file.size, start + chunkSize);
      const blob = file.slice(start, end);
      // PUT with raw octet-stream — multipart envelope adds overhead
      // we don't need for the chunked path.
      await apiClient.put(
        `/uploads/${session.id}/chunks/${i}`,
        blob,
        {
          headers: { 'Content-Type': 'application/octet-stream' },
          signal: options.signal,
        }
      );
      uploaded += end - start;
      options.onProgress?.(uploaded, file.size);
    }

    const { data: finalRaw } = await apiClient.post(
      `/uploads/${session.id}/complete`,
      null,
      { signal: options.signal }
    );
    return normalizeAttachment(
      (finalRaw as { attachment?: unknown }).attachment
    );
  },

  /**
   * Upload many files to one entry. A small set goes as one batch request. A
   * big set (more files than the batch limit, or any file past the chunked
   * threshold) goes file by file, a few at a time, each through
   * ``smartUploadForEntry``. The result has the batch shape either way, so a
   * failed file is reported without stopping the others.
   */
  uploadManyForEntry: async (
    entryId: string,
    files: File[],
    options: {
      onFileDone?(done: number, total: number): void;
      thresholdBytes?: number;
      concurrency?: number;
      signal?: AbortSignal;
    } = {}
  ): Promise<AttachmentBatchResult> => {
    const threshold = options.thresholdBytes ?? 100 * 1024 * 1024;
    const batchable =
      files.length <= BATCH_FILE_LIMIT && files.every(f => f.size <= threshold);
    if (batchable) {
      return attachmentsApi.batchUploadForEntry(entryId, files, {
        signal: options.signal,
      });
    }
    const results: AttachmentBatchResult['results'] = new Array(files.length);
    let next = 0;
    let done = 0;
    const worker = async () => {
      while (next < files.length) {
        const i = next++;
        try {
          results[i] = {
            attachment: await attachmentsApi.smartUploadForEntry(entryId, files[i], {
              thresholdBytes: threshold,
              signal: options.signal,
            }),
          };
        } catch (e) {
          results[i] = {
            error: e instanceof Error ? e.message : 'Upload failed',
            filename: files[i].name,
          };
        }
        done += 1;
        options.onFileDone?.(done, files.length);
      }
    };
    await Promise.all(
      Array.from({ length: Math.min(options.concurrency ?? 3, files.length) }, worker)
    );
    const failed = results.filter(r => 'error' in r).length;
    return {
      results,
      summary: { total: files.length, succeeded: files.length - failed, failed },
    };
  },

  /**
   * Upload that auto-routes: single-shot multipart for small files,
   * chunked for large ones. The threshold is configurable but
   * defaults to 100 MiB — well below the single-shot ceiling so most
   * users never see the chunked path even on slow connections.
   */
  smartUploadForEntry: async (
    entryId: string,
    file: File,
    options: {
      onProgress?(loaded: number, total: number): void;
      thresholdBytes?: number;
      signal?: AbortSignal;
    } = {}
  ): Promise<AttachmentRecord> => {
    const threshold = options.thresholdBytes ?? 100 * 1024 * 1024;
    if (file.size <= threshold) {
      return attachmentsApi.uploadForEntry(entryId, file, {
        onUploadProgress: (event) => {
          if (event.total && options.onProgress) {
            options.onProgress(event.loaded, event.total);
          }
        },
        signal: options.signal,
      });
    }
    return attachmentsApi.chunkedUploadForEntry(entryId, file, {
      onProgress: options.onProgress,
      signal: options.signal,
    });
  },
};

export interface ChunkedUploadSession {
  id: string;
  entry_id: string;
  uploaded_by: string;
  filename: string;
  mime_type: string;
  total_bytes: number;
  received_bytes: number;
  remaining_bytes: number;
  chunk_size: number;
  next_chunk_index: number;
  content_hash: string;
  status:
    | 'pending'
    | 'active'
    | 'complete'
    | 'expired'
    | 'cancelled'
    | string;
  created_at?: string;
  updated_at?: string;
  expires_at?: string;
  error?: string;
}
