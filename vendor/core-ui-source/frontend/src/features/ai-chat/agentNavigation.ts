/** Accept only typed, local destinations from the live navigation tool. */
export function agentNavigationPath(result: unknown, threadId: string, workspaceId: string | null): string | null {
  if (typeof result === 'string') {
    try { result = JSON.parse(result); } catch { return null; }
  }
  if (!result || typeof result !== 'object') return null;
  const payload = result as Record<string, unknown>;
  if (payload.ok !== true || !payload.navigation || typeof payload.navigation !== 'object') return null;
  const nav = payload.navigation as Record<string, unknown>;
  if (nav.thread_id !== threadId || nav.workspace_id !== workspaceId || typeof nav.path !== 'string') return null;
  const valid = /^\/(?:apps\/n\.WorkspaceApp\.[A-Za-z0-9_-]+|entries\/n\.Entry\.[A-Za-z0-9_-]+|tracks\/n\.Track\.[A-Za-z0-9_-]+(?:\?(?:entry=n\.Entry\.[A-Za-z0-9_-]+|view_id=n\.View\.[A-Za-z0-9_-]+))?)$/;
  return valid.test(nav.path) ? nav.path : null;
}
