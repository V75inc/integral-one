import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Trash2 } from 'lucide-react';
import { adminApi, type AdminDeletionPreview, type AdminUserDetail } from '../../api/admin';
import {
  Avatar,
  Badge,
  Button,
  LINE_ICON_STROKE,
  PageHeading,
  PageMeta,
  PageSection,
  PageShell,
  Skeleton,
} from '../../components/ui';
import { Input, Text } from '../../ui';
import { useConfirm } from '../../context/ConfirmContext';
import { useToast } from '../../context/ToastContext';
import { useSetCrumbs } from '../../context/CrumbsContext';
import { useAuth } from '../../context/AuthContext';
import { invalidateAfterAdminUserDelete } from '../../queryKeys';
import { AdminEntityLink } from '../../components/admin/AdminEntityLink';

function AdminDeleteUserModal({
  open,
  user,
  onClose,
  onDeleted,
}: {
  open: boolean;
  user: AdminUserDetail;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const [preview, setPreview] = useState<AdminDeletionPreview | null>(null);
  const [loading, setLoading] = useState(false);
  const [confirmEmail, setConfirmEmail] = useState('');
  const [forceAcknowledged, setForceAcknowledged] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setConfirmEmail('');
    setForceAcknowledged(false);
    setError(null);
    setLoading(true);
    adminApi
      .getDeletionPreview(user.id)
      .then(setPreview)
      .catch(() => setError('Could not load deletion preview.'))
      .finally(() => setLoading(false));
  }, [open, user.id]);

  if (!open) return null;

  const emailForConfirm = preview?.email || user.email;
  const emailMatches =
    confirmEmail.trim().toLowerCase() === emailForConfirm.trim().toLowerCase();
  const needsForce = preview != null && !preview.can_delete && preview.can_force_delete;
  const canSubmit =
    emailMatches &&
    (preview?.can_delete === true || (needsForce && forceAcknowledged));

  async function handleDelete() {
    if (!canSubmit || deleting) return;
    setDeleting(true);
    setError(null);
    try {
      await adminApi.deleteUser(user.id, confirmEmail.trim(), needsForce);
      onDeleted();
    } catch (err: unknown) {
      const resp = (err as { response?: { data?: { message?: string; details?: { blockers?: Array<{ message: string }> } } } })
        ?.response?.data;
      if (resp?.details?.blockers?.length) {
        setError(resp.details.blockers.map((b) => b.message).join(' '));
      } else {
        setError(resp?.message || 'Could not delete user.');
      }
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-overlay flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
      role="dialog"
      aria-modal="true"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="w-full max-w-lg rounded-xl border border-[var(--border-subtle)] bg-[var(--bg)] p-6 shadow-xl">
        <h2 className="text-lg font-semibold text-[var(--danger-text)]">Delete user permanently</h2>
        <Text variant="body" tone="muted" as="p" className="mt-2">
          This will permanently delete <strong>{user.display_name}</strong> and cannot be undone.
        </Text>
        {loading && (
          <Text variant="body" tone="muted" as="p" className="mt-4">
            Loading preview…
          </Text>
        )}
        {preview && preview.blockers.length > 0 && (
          <div className="mt-4 rounded-lg border border-[var(--danger-border)] bg-[var(--danger-bg)] p-3">
            <p className="text-sm font-medium text-[var(--danger-text)]">Warnings</p>
            <ul className="mt-2 list-disc pl-5 text-sm text-[var(--danger-text)]">
              {preview.blockers.map((b) => (
                <li key={b.code}>{b.message}</li>
              ))}
            </ul>
          </div>
        )}
        {preview?.impact?.length ? (
          <div className="mt-4">
            <Text variant="body" weight="medium" tone="muted" as="p">What will happen</Text>
            <Text variant="body" tone="muted" as="ul" className="mt-2 list-disc pl-5">
              {preview.impact.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </Text>
          </div>
        ) : null}
        {preview && emailForConfirm && (
          <div className="mt-4">
            <label htmlFor="admin-delete-confirm">
              <Text variant="body" tone="muted" as="span">
                Type <strong>{emailForConfirm}</strong> to confirm
              </Text>
            </label>
            <Input
              id="admin-delete-confirm"
              type="email"
              value={confirmEmail}
              onChange={(e) => setConfirmEmail(e.target.value)}
              className="mt-2 w-full"
            />
          </div>
        )}
        {needsForce && emailMatches && (
          <Text variant="body" tone="muted" as="label" className="mt-4 flex items-start gap-2">
            <input
              type="checkbox"
              checked={forceAcknowledged}
              onChange={(e) => setForceAcknowledged(e.target.checked)}
              className="mt-0.5"
            />
            <span>
              Force delete despite the warnings above. Organization resources may be
              left without an owner until cleaned up in Admin → Workspaces.
            </span>
          </Text>
        )}
        {error && <p className="mt-3 text-sm text-[var(--danger-text)]">{error}</p>}
        <div className="mt-6 flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose} disabled={deleting}>
            Cancel
          </Button>
          <Button
            variant="danger"
            onClick={handleDelete}
            disabled={!canSubmit || deleting}
          >
            {deleting ? 'Deleting…' : 'Delete permanently'}
          </Button>
        </div>
      </div>
    </div>
  );
}

export function AdminUserDetailPage() {
  const { userId = '' } = useParams<{ userId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const { showToast } = useToast();
  const { user: me } = useAuth();
  const [displayName, setDisplayName] = useState('');
  const [emailVerified, setEmailVerified] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [sendingReset, setSendingReset] = useState(false);

  const { data: user, isPending, error, refetch } = useQuery({
    queryKey: ['admin', 'user', userId],
    queryFn: () => adminApi.getUser(userId),
    enabled: !!userId,
  });

  useEffect(() => {
    if (user) {
      setDisplayName(user.display_name);
      setEmailVerified(user.email_verified);
    }
  }, [user]);

  useSetCrumbs([
    { label: 'Admin', to: '/admin' },
    { label: 'Users', to: '/admin/users' },
    { label: user?.display_name || 'User' },
  ]);

  async function refresh() {
    await queryClient.invalidateQueries({ queryKey: ['admin', 'user', userId] });
    await queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
  }

  async function handleSave() {
    if (!user) return;
    setSaving(true);
    try {
      await adminApi.updateUser(user.id, {
        display_name: displayName.trim(),
        email_verified: emailVerified,
      });
      showToast('User updated', 'success');
      await refresh();
    } catch {
      showToast('Could not update user', 'error');
    } finally {
      setSaving(false);
    }
  }

  async function runAction(
    label: string,
    action: () => Promise<AdminUserDetail>,
  ) {
    const ok = await confirm({
      title: label,
      message: `Are you sure you want to ${label.toLowerCase()} for ${user?.display_name}?`,
      confirmLabel: label,
      variant: 'danger',
    });
    if (!ok) return;
    try {
      await action();
      showToast(`${label} succeeded`, 'success');
      await refresh();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      showToast(msg || `${label} failed`, 'error');
    }
  }

  async function handleSendPasswordReset() {
    if (!user || sendingReset) return;
    const ok = await confirm({
      title: 'Send password reset',
      message: `Send a password reset email to ${user.email}?`,
      confirmLabel: 'Send email',
    });
    if (!ok) return;
    setSendingReset(true);
    try {
      const result = await adminApi.sendPasswordReset(user.id);
      showToast(result.message, 'success');
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data
        ?.message;
      showToast(msg || 'Could not send password reset email', 'error');
    } finally {
      setSendingReset(false);
    }
  }

  // Boolean(): the second arm is `string && comparison`, which yields
  // `boolean | "" | undefined` — not assignable to a `disabled` prop.
  const isSelf = Boolean(
    me?.id === user?.id || (me?.user_id && me.user_id === user?.user_id)
  );

  return (
    <PageShell>
      <PageSection>
        {/* Link tokens rather than --text/--text-muted: this IS a link, the
            rest of the app styles back-links this way, and <Text> has no
            hover-tone pair to express it. */}
        <Link
          to="/admin/users"
          className="inline-flex items-center gap-2 text-sm text-[var(--link)] hover:text-[var(--link-hover)]"
        >
          <ArrowLeft size={14} strokeWidth={LINE_ICON_STROKE} />
          Back to users
        </Link>
        {isPending && <Skeleton className="mt-6 h-40 w-full rounded-xl" />}
        {error && (
          <p className="mt-6 text-sm text-[var(--danger-text)]">
            Could not load user.{' '}
            <button type="button" className="underline" onClick={() => refetch()}>
              Retry
            </button>
          </p>
        )}
        {user && (
          <div className="mt-6">
            <div className="flex flex-wrap items-start gap-4">
              <Avatar name={user.display_name} size="lg" />
              <div className="flex-1 min-w-0">
                <PageHeading>{user.display_name || 'User'}</PageHeading>
                <PageMeta as="p">{user.email}</PageMeta>
                <div className="mt-2 flex flex-wrap gap-2">
                  <Badge variant={user.is_active ? 'success' : 'danger'}>
                    {user.is_active ? 'Active' : 'Inactive'}
                  </Badge>
                  {user.is_platform_admin && (
                    <Badge variant="info">Super Admin</Badge>
                  )}
                  {user.email_verified && (
                    <Badge variant="default">Email verified</Badge>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </PageSection>

      {user && (
        <>
          <PageSection className="mt-8">
            <Text variant="body" weight="semibold" tone="subtle" as="h2" className="uppercase tracking-[0.08em]">
              Profile
            </Text>
            <div className="mt-4 grid gap-4 max-w-lg">
              <label className="block text-sm">
                <Text variant="body" tone="muted" as="span">Display name</Text>
                <Input
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  className="mt-1 w-full"
                />
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={emailVerified}
                  onChange={(e) => setEmailVerified(e.target.checked)}
                />
                Email verified
              </label>
              <Button onClick={handleSave} disabled={saving}>
                {saving ? 'Saving…' : 'Save changes'}
              </Button>
            </div>
          </PageSection>

          <PageSection className="mt-8">
            <Text variant="body" weight="semibold" tone="subtle" as="h2" className="uppercase tracking-[0.08em]">
              Memberships
            </Text>
            <div className="mt-4 space-y-3 text-sm">
              {user.personal_workspaces.map((ws) => (
                <div key={ws.workspace_id} className="rounded-lg border border-[var(--border-subtle)] p-3 flex justify-between items-start gap-3">
                  <div>
                    <AdminEntityLink
                      type="workspace"
                      id={ws.workspace_id}
                      label={`${ws.name} (personal)`}
                    />
                    <PageMeta as="p">
                      {ws.app_count} apps · {ws.track_count} tracks
                    </PageMeta>
                  </div>
                </div>
              ))}
              {user.org_memberships.map((m) => (
                <div key={m.workspace_id} className="rounded-lg border border-[var(--border-subtle)] p-3 flex justify-between items-start gap-3">
                  <div>
                    <AdminEntityLink type="workspace" id={m.workspace_id} label={m.name} />
                    <Text variant="body" tone="muted" as="p" className="capitalize mt-1">{m.role}</Text>
                  </div>
                </div>
              ))}
              {!user.personal_workspaces.length && !user.org_memberships.length && (
                <Text variant="body" tone="muted" as="p">No workspace memberships.</Text>
              )}
            </div>
          </PageSection>

          <PageSection className="mt-8">
            <Text variant="body" weight="semibold" tone="subtle" as="h2" className="uppercase tracking-[0.08em]">
              Actions
            </Text>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button
                variant="secondary"
                disabled={!user.email || sendingReset}
                onClick={handleSendPasswordReset}
              >
                {sendingReset ? 'Sending…' : 'Send password reset email'}
              </Button>
              {user.is_active ? (
                <Button
                  variant="secondary"
                  disabled={isSelf}
                  onClick={() =>
                    runAction('Deactivate', () => adminApi.deactivateUser(user.id))
                  }
                >
                  Deactivate
                </Button>
              ) : (
                <Button
                  variant="secondary"
                  onClick={() =>
                    runAction('Reactivate', () => adminApi.reactivateUser(user.id))
                  }
                >
                  Reactivate
                </Button>
              )}
              {user.is_platform_admin ? (
                <Button
                  variant="secondary"
                  disabled={isSelf}
                  onClick={() =>
                    runAction('Revoke Super Admin', () => adminApi.demoteAdmin(user.id))
                  }
                >
                  Revoke Super Admin
                </Button>
              ) : (
                <Button
                  variant="secondary"
                  onClick={() =>
                    runAction('Grant Super Admin', () => adminApi.promoteAdmin(user.id))
                  }
                >
                  Grant Super Admin
                </Button>
              )}
              <Button
                variant="danger"
                disabled={isSelf}
                onClick={() => setDeleteOpen(true)}
              >
                <Trash2 size={14} className="mr-1.5 inline" />
                Delete permanently
              </Button>
            </div>
          </PageSection>
        </>
      )}

      {user && (
        <AdminDeleteUserModal
          open={deleteOpen}
          user={user}
          onClose={() => setDeleteOpen(false)}
          onDeleted={async () => {
            setDeleteOpen(false);
            await invalidateAfterAdminUserDelete(queryClient, user.id);
            showToast('User deleted', 'success');
            navigate('/admin/users');
          }}
        />
      )}
    </PageShell>
  );
}
