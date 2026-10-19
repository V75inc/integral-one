/**
 * Phase 7 Plan 07-04 — frontend API client for /api/retrieve (UX-04).
 *
 * Mirrors `backend/app/schemas/retrieve.py` shapes. Consumed by the
 * ``useRetrieve`` hook (frontend/src/hooks/useRetrieve.ts), which is
 * mounted by the FeedFilterStrip + TrackFilterStrip strips on
 * FeedPage and TrackDetailPage. (The standalone RetrievalSearchBox
 * component was retired during the Phase 7 UX consolidation —
 * graph | semantic | hybrid mode now lives inline next to the
 * existing feed/track search inputs.)
 */

import api from './client';
import type { Provenance } from '../types';

// ── Wire types (mirror backend/app/schemas/retrieve.py) ────────────────

export type RetrievalMode = 'graph' | 'semantic' | 'hybrid';

export interface RetrievalResult {
  entry_id: string;
  track_id: string;
  score: number;
  mode_origin: Array<'graph' | 'semantic'>;
  provenance?: Provenance | null;
  snippet?: string | null;
}

export interface RetrieveRequest {
  query: string;
  scope?: string;
  mode?: RetrievalMode;
  k?: number;
  top_n?: number;
}

export interface RetrieveResponse {
  results: RetrievalResult[];
  dropped_for_permission: number;
  mode: RetrievalMode;
  requested_mode: RetrievalMode;
  degraded: boolean;
  candidates_examined: number;
}

// ── Endpoint ──────────────────────────────────────────────

export async function retrieve(
  payload: RetrieveRequest,
): Promise<RetrieveResponse> {
  const res = await api.post('/retrieve', payload);
  return res.data as RetrieveResponse;
}
