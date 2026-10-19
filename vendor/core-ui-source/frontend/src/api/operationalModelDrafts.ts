/**
 * Typed client for the draft / publish / diff / discard / substrate
 * endpoints introduced by Phase 1 of the agent-authorable substrate.
 *
 * Stays separate from ``operationalModels.ts`` (the legacy library + attached
 * profile surface) so the new lifecycle can evolve without churning the
 * existing API.
 */

import apiClient from './client';
import type { OperationalModelNode } from '../types';

export interface ForkDraftResponse {
  draft: OperationalModelNode;
  from_id: string;
}

export interface PublishDraftResponse {
  published_id: string;
  version_number: number;
  migration_run: {
    executed: boolean;
    ops?: Array<Record<string, unknown>>;
    errors?: Array<Record<string, unknown>>;
    mutated_entry_count?: number;
    pending_manual_review?: Array<Record<string, unknown>>;
    skipped_reason?: string;
  };
}

export interface DiffEntryImpact {
  track_id: string;
  total: number;
  would_fail_validation: number;
  would_need_migration: number;
  sample_failing_ids: string[];
  sample_failure_reasons: Array<{ entry_id: string; reason: string }>;
}

export interface ManifestDiff {
  scope: 'track' | 'app';
  field_types: { added: unknown[]; removed: unknown[]; changed: unknown[] };
  view_types: { added: unknown[]; removed: unknown[]; changed: unknown[] };
  entry_types?: { added: unknown[]; removed: unknown[]; changed: unknown[] };
  views?: { added: unknown[]; removed: unknown[]; changed: unknown[] };
  tags?: { added: unknown[]; removed: unknown[]; changed: unknown[] };
  tracks?: { added: unknown[]; removed: unknown[]; changed: unknown[] };
  relations?: { added: unknown[]; removed: unknown[] };
}

export interface DiffResponse {
  candidate_id: string;
  reference_id: string;
  diff: ManifestDiff;
  entry_impact?: DiffEntryImpact[];
}

export interface DiscardDraftResponse {
  discarded: boolean;
  draft_id: string;
  draft_of_id?: string | null;
}

export interface FieldTypeDescriptor {
  type: string;
  base?: string | null;
  label?: string;
  description?: string;
  config_schema?: Record<string, unknown>;
  source?: 'builtin' | 'composite' | 'plugin';
  signed?: boolean;
}

export type ViewTypeDescriptor = FieldTypeDescriptor;

export interface PluginDescriptor {
  id: string;
  source: 'entry_point' | 'directory';
  signed: boolean;
  registered_field_types: string[];
  registered_view_types: string[];
}

export interface SubstrateResponse {
  field_types: FieldTypeDescriptor[];
  view_types: ViewTypeDescriptor[];
  plugins: PluginDescriptor[];
  registry_versions: { field_types: number; view_types: number };
}

export const operationalModelDraftsApi = {
  forkDraft: async (operationalModelId: string): Promise<ForkDraftResponse> => {
    const { data } = await apiClient.post(
      `/operational-models/${operationalModelId}/draft`,
      {}
    );
    return data as ForkDraftResponse;
  },

  publishDraft: async (
    draftId: string,
    options: { run_migrations?: boolean; abort_on_migration_failure?: boolean } = {}
  ): Promise<PublishDraftResponse> => {
    const { data } = await apiClient.post(
      `/operational-models/${draftId}/publish`,
      options
    );
    return data as PublishDraftResponse;
  },

  diff: async (
    operationalModelId: string,
    options: {
      against?: string;
      include_entry_impact?: boolean;
      sample_limit?: number;
    } = {}
  ): Promise<DiffResponse> => {
    const { data } = await apiClient.post(
      `/operational-models/${operationalModelId}/diff`,
      options
    );
    return data as DiffResponse;
  },

  discardDraft: async (draftId: string): Promise<DiscardDraftResponse> => {
    const { data } = await apiClient.post(
      `/operational-models/${draftId}/discard-draft`,
      {}
    );
    return data as DiscardDraftResponse;
  },

  substrate: async (): Promise<SubstrateResponse> => {
    const { data } = await apiClient.get('/operational-model-substrate');
    return data as SubstrateResponse;
  },
};
