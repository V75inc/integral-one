import { describe, expect, it } from 'vitest';
import { agentNavigationPath } from '../agentNavigation';

const payload = (path: string, thread_id = 'thread', workspace_id = 'workspace') => ({
  ok: true, navigation: { path, thread_id, workspace_id },
});

describe('agent navigation destinations', () => {
  it.each([
    '/apps/n.WorkspaceApp.app', '/entries/n.Entry.record',
    '/tracks/n.Track.collection?entry=n.Entry.record',
    '/tracks/n.Track.collection?view_id=n.View.board',
  ])('accepts the local resource route %s', path => {
    expect(agentNavigationPath(payload(path), 'thread', 'workspace')).toBe(path);
  });
  it.each(['https://example.com', '//example.com', '/login', '/tracks/../admin',
    '/tracks/n.Track.collection?redirect=https://example.com'])('rejects %s', path => {
    expect(agentNavigationPath(payload(path), 'thread', 'workspace')).toBeNull();
  });
  it('refuses another conversation or workspace', () => {
    expect(agentNavigationPath(payload('/entries/n.Entry.record', 'other'), 'thread', 'workspace')).toBeNull();
    expect(agentNavigationPath(payload('/entries/n.Entry.record', 'thread', 'other'), 'thread', 'workspace')).toBeNull();
  });
});
