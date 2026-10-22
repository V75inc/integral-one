import api from './client';

export interface DesignDecision {
  thread_id: string;
  workspace_id: string;
  thread_title: string;
  summary: string;
  design_id: string;
  blueprint_revision: number;
  proposed_at: string;
  approved: boolean;
  partial_build: boolean;
}

export async function listDesignDecisions(): Promise<DesignDecision[]> {
  const response = await api.get('/agentive/staging/designs');
  return response.data.designs;
}

export async function discardDesign(design: DesignDecision): Promise<void> {
  await api.post('/agentive/staging/designs/discard', {
    thread_id: design.thread_id,
    design_id: design.design_id,
    blueprint_revision: design.blueprint_revision,
    proposed_at: design.proposed_at,
  });
}
