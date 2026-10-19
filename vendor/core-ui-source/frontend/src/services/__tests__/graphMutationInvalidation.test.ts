import { describe, expect, it, vi } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import {
  COMMENT_REFETCH_EVENT,
  dispatchEntryRefetch,
  ENTRY_REFETCH_EVENT,
  invalidateAfterAgentWrite,
  invalidateAfterChangeEvent,
} from '../graphMutationInvalidation';
import type { StagedChange } from '../../features/ai-chat/staging/types';

function staged(partial: Partial<StagedChange>): StagedChange {
  return {
    _kind: 'staged_change',
    token: 'tok',
    kind: 'update_entry',
    summary: 'Update entry',
    diff_human: '…',
    diff_machine: { op: 'update_entry', track_id: 'n.Track.1', entry_id: 'n.Entry.1' },
    state: 'consumed',
    created_at: '2026-01-01T00:00:00Z',
    expires_at: '2026-01-01T00:10:00Z',
    autonomy_grant_used: false,
    ...partial,
  };
}

describe('invalidateAfterChangeEvent', () => {
  it('refreshes entry comments and related lists when a comment is created', async () => {
    const qc = new QueryClient();
    const invalidateSpy = vi.spyOn(qc, 'invalidateQueries');
    const handler = vi.fn();
    window.addEventListener(COMMENT_REFETCH_EVENT, handler);
    try {
      await invalidateAfterChangeEvent(qc, {
        id: 'evt-comment',
        ts: '2026-01-01T00:00:00Z',
        actor_kind: 'user',
        actor_id: 'user-a',
        action: 'comment.create',
        resource_type: 'Comment',
        resource_id: 'n.Comment.1',
        scope: 'track:n.Track.abc',
        after: { _entry_id: 'n.Entry.42' },
      });

      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['feed'] });
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: ['track', 'n.Track.abc', 'entries'],
      });
      expect(handler).toHaveBeenCalledTimes(1);
      expect(
        (handler.mock.calls[0][0] as CustomEvent<{ entryId: string }>).detail
          .entryId,
      ).toBe('n.Entry.42');
    } finally {
      window.removeEventListener(COMMENT_REFETCH_EVENT, handler);
    }
  });

  it('refreshes the notification list when a notification is created', async () => {
    const qc = new QueryClient();
    const invalidateSpy = vi.spyOn(qc, 'invalidateQueries');
    const handler = vi.fn();
    window.addEventListener(COMMENT_REFETCH_EVENT, handler);

    try {
      await invalidateAfterChangeEvent(qc, {
        id: 'evt-notification',
        ts: '2026-01-01T00:00:00Z',
        actor_kind: 'system',
        actor_id: 'system',
        action: 'notification.create',
        resource_type: 'Notification',
        resource_id: 'n.Notification.1',
        scope: 'user:user-b',
        after: {
          type: 'mention',
          entry_id: 'n.Entry.42',
        },
      });

      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['notifications'] });
      expect(handler).toHaveBeenCalledTimes(1);
      expect(
        (handler.mock.calls[0][0] as CustomEvent<{ entryId: string }>).detail
          .entryId,
      ).toBe('n.Entry.42');
    } finally {
      window.removeEventListener(COMMENT_REFETCH_EVENT, handler);
    }
  });

  it('invalidates feed and track entry queries on entry.update', async () => {
    const qc = new QueryClient();
    const invalidateSpy = vi.spyOn(qc, 'invalidateQueries');

    await invalidateAfterChangeEvent(qc, {
      id: 'evt-1',
      ts: '2026-01-01T00:00:00Z',
      actor_kind: 'agent',
      actor_id: 'agent-1',
      action: 'entry.update',
      resource_type: 'Entry',
      resource_id: 'n.Entry.1',
      scope: 'track:n.Track.abc',
    });

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['feed'] });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ['track', 'n.Track.abc', 'entries'],
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ['dashboard-data'],
    });
  });

  it('dispatches entry refetch on entry.update', async () => {
    const qc = new QueryClient();
    const handler = vi.fn();
    window.addEventListener(ENTRY_REFETCH_EVENT, handler);
    try {
      await invalidateAfterChangeEvent(qc, {
        id: 'evt-2',
        ts: '2026-01-01T00:00:00Z',
        actor_kind: 'agent',
        actor_id: 'agent-1',
        action: 'entry.update',
        resource_id: 'n.Entry.99',
        scope: 'track:n.Track.abc',
      });
      expect(handler).toHaveBeenCalledTimes(1);
      expect(
        (handler.mock.calls[0][0] as CustomEvent<{ entryId: string }>).detail
          .entryId,
      ).toBe('n.Entry.99');
    } finally {
      window.removeEventListener(ENTRY_REFETCH_EVENT, handler);
    }
  });

  it('does not dispatch entry refetch on entry.delete', async () => {
    const qc = new QueryClient();
    const handler = vi.fn();
    window.addEventListener(ENTRY_REFETCH_EVENT, handler);
    try {
      await invalidateAfterChangeEvent(qc, {
        id: 'evt-3',
        ts: '2026-01-01T00:00:00Z',
        actor_kind: 'agent',
        actor_id: 'agent-1',
        action: 'entry.delete',
        resource_id: 'n.Entry.99',
        scope: 'track:n.Track.abc',
      });
      expect(handler).not.toHaveBeenCalled();
    } finally {
      window.removeEventListener(ENTRY_REFETCH_EVENT, handler);
    }
  });

  it('marks a deleted track stale without refetching it', async () => {
    const qc = new QueryClient();
    const invalidateSpy = vi.spyOn(qc, 'invalidateQueries');

    await invalidateAfterChangeEvent(qc, {
      id: 'evt-track-delete',
      ts: '2026-01-01T00:00:00Z',
      actor_kind: 'user',
      actor_id: 'user-a',
      action: 'track.delete',
      resource_type: 'Track',
      resource_id: 'n.Track.deleted',
      scope: 'track:n.Track.deleted',
    });

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['feed'] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['workspaces'] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['tracks'] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['dashboard-data'] });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ['track', 'n.Track.deleted'],
      refetchType: 'none',
    });
    expect(invalidateSpy).not.toHaveBeenCalledWith({
      queryKey: ['track', 'n.Track.deleted', 'entries'],
    });
  });

  it('invalidates dashboards on dashboard.update', async () => {
    const qc = new QueryClient();
    const invalidateSpy = vi.spyOn(qc, 'invalidateQueries');

    await invalidateAfterChangeEvent(qc, {
      id: 'evt-4',
      ts: '2026-01-01T00:00:00Z',
      actor_kind: 'agent',
      actor_id: 'agent-1',
      action: 'dashboard.update',
      resource_type: 'Dashboard',
      resource_id: 'n.Dashboard.1',
      scope: 'app:n.WorkspaceApp.abc',
    });

    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ['dashboards', 'n.WorkspaceApp.abc'],
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ['dashboard-data', 'n.WorkspaceApp.abc'],
    });
  });
});

describe('invalidateAfterAgentWrite', () => {
  it('invalidates feed and track entries for update_entry staging', async () => {
    const qc = new QueryClient();
    const invalidateSpy = vi.spyOn(qc, 'invalidateQueries');

    await invalidateAfterAgentWrite(qc, {
      staged: staged({ kind: 'update_entry' }),
      executeResult: { entry: { id: 'n.Entry.1', track_id: 'n.Track.abc' } },
    });

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['feed'] });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ['track', 'n.Track.abc', 'entries'],
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ['dashboard-data'],
    });
  });

  it('invalidates dashboards for create_dashboard staging', async () => {
    const qc = new QueryClient();
    const invalidateSpy = vi.spyOn(qc, 'invalidateQueries');

    await invalidateAfterAgentWrite(qc, {
      staged: staged({
        kind: 'create_dashboard',
        diff_machine: { op: 'create_dashboard', app_id: 'n.WorkspaceApp.abc' },
      }),
    });

    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ['dashboards', 'n.WorkspaceApp.abc'],
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ['dashboard-data', 'n.WorkspaceApp.abc'],
    });
  });

  it('invalidates dashboard-data for update_entry when app_id is present', async () => {
    const qc = new QueryClient();
    const invalidateSpy = vi.spyOn(qc, 'invalidateQueries');

    await invalidateAfterAgentWrite(qc, {
      staged: staged({
        kind: 'update_entry',
        diff_machine: {
          op: 'update_entry',
          track_id: 'n.Track.1',
          entry_id: 'n.Entry.1',
          app_id: 'n.WorkspaceApp.xyz',
        },
      }),
      executeResult: { entry: { id: 'n.Entry.1', track_id: 'n.Track.1' } },
    });

    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ['dashboard-data', 'n.WorkspaceApp.xyz'],
    });
  });

  it('dispatches entry refetch for consumed update_entry staging', async () => {
    const qc = new QueryClient();
    const handler = vi.fn();
    window.addEventListener(ENTRY_REFETCH_EVENT, handler);
    try {
      await invalidateAfterAgentWrite(qc, {
        staged: staged({ kind: 'update_entry' }),
        executeResult: { entry: { id: 'n.Entry.1', track_id: 'n.Track.abc' } },
      });
      expect(handler).toHaveBeenCalledTimes(1);
      expect(
        (handler.mock.calls[0][0] as CustomEvent<{ entryId: string }>).detail
          .entryId,
      ).toBe('n.Entry.1');
    } finally {
      window.removeEventListener(ENTRY_REFETCH_EVENT, handler);
    }
  });
});

describe('dispatchEntryRefetch', () => {
  it('emits integral:entry-refetch with entryId detail', () => {
    const handler = vi.fn();
    window.addEventListener(ENTRY_REFETCH_EVENT, handler);
    try {
      dispatchEntryRefetch('n.Entry.42');
      expect(handler).toHaveBeenCalledTimes(1);
      expect(
        (handler.mock.calls[0][0] as CustomEvent<{ entryId: string }>).detail
          .entryId,
      ).toBe('n.Entry.42');
    } finally {
      window.removeEventListener(ENTRY_REFETCH_EVENT, handler);
    }
  });
});
