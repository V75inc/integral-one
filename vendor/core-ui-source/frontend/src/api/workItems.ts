import apiClient from './client';

export type WorkItemStatus =
  | 'queued'
  | 'running'
  | 'waiting_for_human'
  | 'waiting_for_event'
  | 'retry_wait'
  | 'succeeded'
  | 'failed'
  | 'cancelled'
  | 'expired'
  | 'dead_letter';

/** Safe projection of lifecycle work authorized for the current principal. */
export interface WorkItemStatusResponse {
  work_item_id: string;
  kind: string;
  operation?: string;
  status: WorkItemStatus;
  workspace_id: string;
  app_id: string;
  attempt: number;
  next_attempt_at: string;
  updated_at: string;
  result_refs: string[];
  failure?: { code: string; message?: string };
  /** App jobs (kind ``app_tool``): the App's own label for the job. */
  label?: string;
  /** App jobs: progress the running tool reported. */
  progress?: { done?: number; total?: number; label?: string };
}

export const workItemsApi = {
  list: (workspaceId: string, cursor?: string) =>
    apiClient.get<{ items: WorkItemStatusResponse[]; next_cursor: string | null }>('/work-items',
      { params: { workspace_id: workspaceId, ...(cursor ? { cursor } : {}) } })
      .then(response => response.data),
  get: (workItemId: string) =>
    apiClient
      .get<WorkItemStatusResponse>(`/work-items/${workItemId}`)
      .then(response => response.data),
};
