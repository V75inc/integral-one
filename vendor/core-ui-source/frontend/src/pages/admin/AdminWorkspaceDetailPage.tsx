import { Text, Input, Textarea } from '../../ui';
import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Trash2 } from 'lucide-react';
import { adminApi } from '../../api/admin';
import {
  Badge,
  Button,
  LINE_ICON_STROKE,
  PageHeading,
  PageMeta,
  PageSection,
  PageShell,
  Skeleton,
} from '../../components/ui';
import { useConfirm } from '../../context/ConfirmContext';
import { useToast } from '../../context/ToastContext';
import { useSetCrumbs } from '../../context/CrumbsContext';
import { invalidateAfterAdminWorkspaceDelete } from '../../queryKeys';
import { AdminEntityLink, AdminOwnerCell } from '../../components/admin/AdminEntityLink';

export function AdminWorkspaceDetailPage() {
  const { workspaceId = '' } = useParams<{ workspaceId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const { showToast } = useToast();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);

  const { data: workspace, isPending, error, refetch } = useQuery({
    queryKey: ['admin', 'workspace', workspaceId],
    queryFn: () => adminApi.getWorkspace(workspaceId),
    enabled: !!workspaceId,
  });

  const { data: membersData } = useQuery({
    queryKey: ['admin', 'workspace-members', workspaceId],
    queryFn: () => adminApi.listWorkspaceMembers(workspaceId, { per_page: 100 }),
    enabled: !!workspaceId,
  });

  useEffect(() => {
    if (workspace) {
      setName(workspace.name);
      setDescription(workspace.description);
    }
  }, [workspace]);

  useSetCrumbs([
    { label: 'Admin', to: '/admin' },
    { label: 'Workspaces', to: '/admin/workspaces' },
    { label: workspace?.name || 'Workspace' },
  ]);

  async function handleSave() {
    if (!workspace) return;
    setSaving(true);
    try {
      await adminApi.updateWorkspace(workspace.id, {
        name: name.trim(),
        description,
      });
      showToast('Workspace updated', 'success');
      await queryClient.invalidateQueries({ queryKey: ['admin', 'workspace', workspaceId] });
    } catch {
      showToast('Could not update workspace', 'error');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!workspace) return;
    const ok = await confirm({
      title: 'Delete workspace',
      message: `Permanently delete "${workspace.name}" and all contained resources?`,
      confirmLabel: 'Delete',
      variant: 'danger',
    });
    if (!ok) return;
    try {
      const deletedId = workspace.id;
      await adminApi.deleteWorkspace(deletedId);
      await invalidateAfterAdminWorkspaceDelete(queryClient, deletedId);
      showToast('Workspace deleted', 'success');
      navigate('/admin/workspaces');
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      showToast(msg || 'Could not delete workspace', 'error');
    }
  }

  return (
    <PageShell>
      <PageSection>
        <Link
          to="/admin/workspaces"
          className="inline-flex items-center gap-2 hover:opacity-80"
        ><Text variant="body" tone="muted" className="inline-flex items-center gap-2">
          <ArrowLeft size={14} strokeWidth={LINE_ICON_STROKE} />
          Back to workspaces
        </Text></Link>
        {isPending && <Skeleton className="mt-6 h-32 w-full rounded-xl" />}
        {error && (
          <p className="mt-6 text-sm text-[var(--danger-text)]">
            Could not load workspace.{' '}
            <button type="button" className="underline" onClick={() => refetch()}>Retry</button>
          </p>
        )}
        {workspace && (
          <div className="mt-6">
            <PageHeading>{workspace.name}</PageHeading>
            <PageMeta as="p" className="capitalize">{workspace.kind}</PageMeta>
            {workspace.owner ? (
              <PageMeta>
                <Text as="span" variant="body" tone="subtle" className="">Owner: </Text>
                <AdminOwnerCell owner={workspace.owner} />
              </PageMeta>
            ) : null}
            <div className="mt-2 flex gap-2">
              <Badge>{workspace.member_count} members</Badge>
              <Badge>{workspace.app_count} apps</Badge>
              <Badge>{workspace.track_count} tracks</Badge>
            </div>
            <Link
              to={`/workspaces/${workspace.id}`}
              className="mt-3 inline-block text-sm text-[var(--link)]"
            >
              Open in app →
            </Link>
          </div>
        )}
      </PageSection>

      {workspace && (
        <>
          <PageSection className="mt-8">
            <Text as="h2" variant="body" tone="subtle" weight="semibold" className="uppercase tracking-[0.08em]">Edit</Text>
            <div className="mt-4 grid gap-4 max-w-lg">
              <label className="block text-sm">
                <Text as="span" variant="body" tone="muted" className="">Name</Text>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="mt-1"
                />
              </label>
              <label className="block text-sm">
                <Text as="span" variant="body" tone="muted" className="">Description</Text>
                <Textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={3}
                  className="mt-1"
                />
              </label>
              <Button onClick={handleSave} disabled={saving}>{saving ? 'Saving…' : 'Save'}</Button>
            </div>
          </PageSection>

          <PageSection className="mt-8">
            <Text as="h2" variant="body" tone="subtle" weight="semibold" className="uppercase tracking-[0.08em]">Members</Text>
            <div className="mt-4 space-y-2">
              {(membersData?.members ?? []).map((m) => (
                <div key={m.id} className="flex items-center justify-between rounded-lg border border-[var(--border-subtle)] px-3 py-2 text-sm">
                  <div>
                    <AdminEntityLink
                      type="user"
                      id={m.id}
                      label={m.display_name || m.email || 'Unnamed user'}
                    />
                    {m.email && m.display_name ? (
                      <Text as="p" variant="body" tone="muted" className="">{m.email}</Text>
                    ) : null}
                  </div>
                  <Text as="span" variant="body" tone="muted" className="capitalize">{m.role}</Text>
                </div>
              ))}
            </div>
          </PageSection>

          <PageSection className="mt-8">
            <Button variant="danger" onClick={handleDelete}>
              <Trash2 size={14} className="mr-1.5 inline" />
              Delete workspace
            </Button>
          </PageSection>
        </>
      )}
    </PageShell>
  );
}
