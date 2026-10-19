import apiClient from './client';

/**
 * Client for ``POST /api/tools/{tool_key}`` — the existing, generic
 * workspace-tool invocation endpoint (``backend/app/api/tools.py``,
 * unmodified). Used by ``ActionBarWidget`` to run a bundle tool declared in
 * an app's ``app.tools[]`` from a button click.
 */
export interface ToolCallResponse {
  output: Record<string, unknown>;
  tool_key: string;
}

export const toolsApi = {
  call: async (
    toolKey: string,
    input: Record<string, unknown> = {}
  ): Promise<ToolCallResponse> => {
    const { data } = await apiClient.post(`/tools/${toolKey}`, { input });
    return data as ToolCallResponse;
  },
};
