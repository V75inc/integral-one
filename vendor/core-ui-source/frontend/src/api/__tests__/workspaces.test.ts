import { describe, it, expect, vi } from 'vitest';
import {
  createWorkspaceFromOperationalModel,
  isOwnedPersonalWorkspace,
  listWorkspaceOperationalModels,
  workspacesApi,
  workspaceAccessLabel,
  workspaceMembershipRoleLabel,
} from '../workspaces';
import * as client from '../client';

describe('workspace operational-model client', () => {
  it('lists workspace operational models', async () => {
    const spy = vi.spyOn(client.default, 'get').mockResolvedValue({
      data: { operational_models: [{ slug: 'crm-pm', name: 'CRM', description: '', tags: [] }] },
    });
    const r = await listWorkspaceOperationalModels();
    expect(r).toHaveLength(1);
    expect(r[0].slug).toBe('crm-pm');
    spy.mockRestore();
  });

  it('posts create with workspace_type and operational_model_slug', async () => {
    const spy = vi.spyOn(client.default, 'post').mockResolvedValue({
      data: {
        workspace: { id: 'ws1', kind: 'organization', name: 'Acme' },
      },
    });
    const created = await createWorkspaceFromOperationalModel({
      name: 'Acme',
      kind: 'organization',
      operationalModelSlug: 'crm-pm',
    });
    expect(spy).toHaveBeenCalledWith('/workspaces', {
      name: 'Acme',
      workspace_type: 'company',
      operational_model_slug: 'crm-pm',
    });
    expect(created.id).toBe('ws1');
    spy.mockRestore();
  });

  it('maps personal kind to workspace_type personal', async () => {
    const spy = vi.spyOn(client.default, 'post').mockResolvedValue({
      data: {
        workspace: { id: 'ws2', kind: 'personal', name: 'Side project' },
      },
    });
    const created = await createWorkspaceFromOperationalModel({
      name: 'Side project',
      kind: 'personal',
    });
    expect(spy).toHaveBeenCalledWith('/workspaces', {
      name: 'Side project',
      workspace_type: 'personal',
    });
    expect(created.id).toBe('ws2');
    spy.mockRestore();
  });
});

describe('workspace membership client', () => {
  it('leaves a workspace without deleting it', async () => {
    const spy = vi.spyOn(client.default, 'delete').mockResolvedValue({
      data: { message: 'Workspace removed from your list', workspace_id: 'ws1' },
    });
    await workspacesApi.leave('ws1');
    expect(spy).toHaveBeenCalledWith('/workspaces/ws1/membership');
    spy.mockRestore();
  });
});

describe('workspace ownership labels', () => {
  it('labels a shared Personal workspace as invited for a guest', () => {
    const sharedPersonal = {
      kind: 'personal' as const,
      your_role: 'guest' as const,
    };
    expect(isOwnedPersonalWorkspace(sharedPersonal)).toBe(false);
    expect(workspaceAccessLabel(sharedPersonal)).toBe('Invited');
  });

  it('labels the viewer-owned Personal workspace as Personal', () => {
    const personal = { kind: 'personal' as const, your_role: 'owner' as const };
    expect(isOwnedPersonalWorkspace(personal)).toBe(true);
    expect(workspaceAccessLabel(personal)).toBe('Personal');
  });

  it('exposes explicit membership roles for org workspace chrome', () => {
    expect(workspaceMembershipRoleLabel({ your_role: 'guest' })).toBe('Guest');
    expect(workspaceMembershipRoleLabel({ your_role: 'admin' })).toBe('Admin');
    expect(workspaceMembershipRoleLabel({ your_role: 'owner' })).toBe('Owner');
    expect(workspaceMembershipRoleLabel({ your_role: 'member' })).toBe('Member');
  });
});


describe('workspace list response integrity', () => {
  it('rejects a malformed success instead of overwriting existing workspaces with an empty list', async () => {
    const spy = vi.spyOn(client.default, 'get').mockResolvedValue({ data: { detail: 'temporarily unavailable' } });
    await expect(workspacesApi.list()).rejects.toThrow('Invalid workspace list response');
    spy.mockRestore();
  });
});
