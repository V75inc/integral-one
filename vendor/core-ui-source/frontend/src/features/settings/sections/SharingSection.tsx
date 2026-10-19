import { PageMeta } from '../../../components/ui';
/**
 * Phase 8 Plan 08-05 — Sharing index panel (SET-08).
 *
 * Per A2: this is an INDEX of operator's outbound state across all owned
 * resources. It does NOT duplicate the per-resource collaborator-management
 * surface (which remains on App/Track/Entry detail pages). Each row
 * cross-links to the corresponding detail page via react-router `Link` so
 * users can pivot to the existing per-resource controls.
 *
 * Backend contract: GET /api/me/sharing-overview returns three buckets —
 * share_links / exclusions / invitations. Every mutation invalidates
 * `['sharing-overview']` on success so the index re-fetches.
 *
 * PINNED helpers (B3 — must route through typed wrappers, not raw client):
 *   - `sharingApi.revokeLink(shareLinkId)` (frontend/src/api/sharing.ts:170)
 *   - `sharingApi.removeExclusion(rt, id, userIdToRestore)` (sharing.ts:127)
 *   - `invitationsApi.revokeAny(invitationId)` (NEW wrapper from Plan 08-05
 *     Task 3 — frontend/src/api/invitations.ts; hits DELETE /api/invitations/{id})
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Trash2 } from 'lucide-react';
import { Link } from 'react-router-dom';

import { invitationsApi } from '../../../api/invitations';
import { sharingApi } from '../../../api/sharing';
import {
  sharingOverviewApi,
  type OutboundExclusion,
  type OutboundInvitation,
  type OutboundShareLink,
} from '../../../api/sharingOverview';
import { Button } from '../../../components/ui/Button';
import { Skeleton } from '../../../components/ui/Skeleton';
import { useConfirm } from '../../../context/ConfirmContext';
import { useToast } from '../../../context/ToastContext';
import { SettingsSection } from '../components/Field';
import { Text } from '../../../ui';

const SHARING_OVERVIEW_KEY = ['sharing-overview'] as const;

type ResourceKind = 'app' | 'track' | 'entry';

function resourceHref(kind: ResourceKind, id: string): string {
  // English pluralization for the three resource kinds — keeps the link
  // path aligned with the frontend router (/apps, /tracks, /entries).
  const plural = kind === 'entry' ? 'entries' : `${kind}s`;
  return `/${plural}/${id}`;
}

function errorMessage(err: unknown, fallback: string): string {
  if (err instanceof Error && err.message) return err.message;
  return fallback;
}

export function SharingSection() {
  const qc = useQueryClient();
  const toast = useToast();
  const confirm = useConfirm();

  const overview = useQuery({
    queryKey: SHARING_OVERVIEW_KEY,
    queryFn: () => sharingOverviewApi.get(),
  });

  const invalidate = () =>
    qc.invalidateQueries({ queryKey: SHARING_OVERVIEW_KEY });

  const revokeLinkMut = useMutation({
    mutationFn: (shareLinkId: string) => sharingApi.revokeLink(shareLinkId),
    onSuccess: () => {
      invalidate();
      toast.showToast('Share link revoked', 'success');
    },
    onError: err => {
      toast.showToast(errorMessage(err, 'Failed to revoke share link'), 'error');
    },
  });

  const clearExclusionMut = useMutation({
    mutationFn: (args: {
      resourceType: ResourceKind;
      resourceId: string;
      userIdToRestore: string;
    }) =>
      sharingApi.removeExclusion(
        args.resourceType,
        args.resourceId,
        args.userIdToRestore,
      ),
    onSuccess: () => {
      invalidate();
      toast.showToast('Exclusion cleared', 'success');
    },
    onError: err => {
      toast.showToast(errorMessage(err, 'Failed to clear exclusion'), 'error');
    },
  });

  const revokeInvitationMut = useMutation({
    mutationFn: (invitationId: string) =>
      invitationsApi.revokeAny(invitationId),
    onSuccess: () => {
      invalidate();
      toast.showToast('Invitation revoked', 'success');
    },
    onError: err => {
      toast.showToast(errorMessage(err, 'Failed to revoke invitation'), 'error');
    },
  });

  const handleRevokeLink = async (link: OutboundShareLink) => {
    const ok = await confirm({
      title: 'Revoke this share link?',
      message: `${link.resource_type}:${link.resource_label || 'Unnamed resource'} — role ${link.role}. This cannot be undone.`,
      confirmLabel: 'Revoke',
      variant: 'danger',
    });
    if (!ok) return;
    revokeLinkMut.mutate(link.id);
  };

  const handleClearExclusion = async (excl: OutboundExclusion) => {
    const ok = await confirm({
      title: 'Clear this exclusion?',
      message: `Restore ${excl.excluded_user_display || 'Unnamed user'} to ${excl.resource_type}:${excl.resource_label || 'Unnamed resource'}.`,
      confirmLabel: 'Clear',
      variant: 'danger',
    });
    if (!ok) return;
    clearExclusionMut.mutate({
      resourceType: excl.resource_type,
      resourceId: excl.resource_id,
      userIdToRestore: excl.excluded_user_id,
    });
  };

  const handleRevokeInvitation = async (inv: OutboundInvitation) => {
    const ok = await confirm({
      title: 'Revoke this invitation?',
      message: `${inv.resource_type}:${inv.resource_label || 'Unnamed resource'} — invitee ${inv.invitee_email || 'Unnamed invitee'}.`,
      confirmLabel: 'Revoke',
      variant: 'danger',
    });
    if (!ok) return;
    revokeInvitationMut.mutate(inv.id);
  };

  const data = overview.data;
  const isLoading = overview.isLoading;
  const isError = overview.isError;

  return (
    <div className="flex flex-col gap-5">
      <div>
        <Text variant="heading-md" weight="semibold" as="h2">Sharing</Text>
        <PageMeta as="p">
          Everything you've shared outward — active share links, people
          you've blocked from your resources, and invitations you've sent.
          Click any row to jump to the resource and manage collaborators
          directly.
        </PageMeta>
      </div>

      <SettingsSection
        title="Share links you've created"
        description="Active share links across all your resources. Revoking a link is immediate. Anyone who already redeemed the link keeps access until you remove them from the resource."
      >
        {isLoading ? (
          <Skeleton className="h-16 w-full" />
        ) : isError ? (
          <p className="text-sm text-[var(--danger-fg)]">
            Failed to load sharing overview:{' '}
            {(overview.error as Error | undefined)?.message ?? 'unknown error'}
          </p>
        ) : !data || data.share_links.length === 0 ? (
          <p className="text-sm italic text-[var(--text-subtle)]">
            No active links.
          </p>
        ) : (
          <ul className="flex flex-col gap-2" aria-label="Share links">
            {data.share_links.map(link => (
              <li
                key={link.id}
                className="flex items-center justify-between gap-3 rounded-[var(--radius-card)] border border-[var(--border-subtle)] bg-[var(--panel)] px-3 py-2"
              >
                <div className="min-w-0 flex-1">
                  <Link
                    to={resourceHref(link.resource_type, link.resource_id)}
                    className="text-sm font-medium text-[var(--text)] underline decoration-dotted underline-offset-2 hover:text-[var(--brand-accent-fg)]"
                  >
                    {link.resource_label || `${link.resource_type}:${link.resource_id}`}
                  </Link>
                  <p className="text-xs text-[var(--text-subtle)]">
                    {link.resource_type} · role {link.role} ·
                    {' '}{link.redemptions} redemption{link.redemptions === 1 ? '' : 's'}
                    {link.expires_at ? ` · expires ${link.expires_at}` : ''}
                  </p>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="xs"
                  icon={<Trash2 size={12} />}
                  onClick={() => handleRevokeLink(link)}
                  aria-label={`Revoke share link ${link.id}`}
                >
                  Revoke
                </Button>
              </li>
            ))}
          </ul>
        )}
      </SettingsSection>

      <SettingsSection
        title="People you've blocked"
        description="Users you've blocked from a resource they would otherwise have access to. Clearing the block restores their access."
      >
        {isLoading ? (
          <Skeleton className="h-16 w-full" />
        ) : !data || data.exclusions.length === 0 ? (
          <p className="text-sm italic text-[var(--text-subtle)]">
            No exclusions.
          </p>
        ) : (
          <ul className="flex flex-col gap-2" aria-label="Blocked users">
            {data.exclusions.map(excl => (
              <li
                key={`${excl.resource_type}:${excl.resource_id}:${excl.excluded_user_id}`}
                className="flex items-center justify-between gap-3 rounded-[var(--radius-card)] border border-[var(--border-subtle)] bg-[var(--panel)] px-3 py-2"
              >
                <div className="min-w-0 flex-1">
                  <Link
                    to={resourceHref(excl.resource_type, excl.resource_id)}
                    className="text-sm font-medium text-[var(--text)] underline decoration-dotted underline-offset-2 hover:text-[var(--brand-accent-fg)]"
                  >
                    {excl.resource_label || `${excl.resource_type}:${excl.resource_id}`}
                  </Link>
                  <p className="text-xs text-[var(--text-subtle)]">
                    Excluded: {excl.excluded_user_display || 'Unnamed user'}
                    {excl.reason ? ` · "${excl.reason}"` : ''}
                  </p>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="xs"
                  icon={<Trash2 size={12} />}
                  onClick={() => handleClearExclusion(excl)}
                  aria-label={`Clear exclusion ${excl.resource_id} ${excl.excluded_user_id}`}
                >
                  Clear
                </Button>
              </li>
            ))}
          </ul>
        )}
      </SettingsSection>

      <SettingsSection
        title="Pending invitations"
        description="Invitations to an App, Track, or Entry that the recipient hasn't accepted yet. Workspace-level invitations are managed on each workspace's member page."
      >
        {isLoading ? (
          <Skeleton className="h-16 w-full" />
        ) : !data || data.invitations.length === 0 ? (
          <p className="text-sm italic text-[var(--text-subtle)]">
            No pending invitations.
          </p>
        ) : (
          <ul className="flex flex-col gap-2" aria-label="Pending invitations">
            {data.invitations.map(inv => (
              <li
                key={inv.id}
                className="flex items-center justify-between gap-3 rounded-[var(--radius-card)] border border-[var(--border-subtle)] bg-[var(--panel)] px-3 py-2"
              >
                <div className="min-w-0 flex-1">
                  <Link
                    to={resourceHref(inv.resource_type, inv.resource_id)}
                    className="text-sm font-medium text-[var(--text)] underline decoration-dotted underline-offset-2 hover:text-[var(--brand-accent-fg)]"
                  >
                    {inv.resource_label || `${inv.resource_type}:${inv.resource_id}`}
                  </Link>
                  <p className="text-xs text-[var(--text-subtle)]">
                    {inv.resource_type} · role {inv.role} · invited{' '}
                    {inv.invitee_email || 'Unnamed invitee'}
                  </p>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="xs"
                  icon={<Trash2 size={12} />}
                  onClick={() => handleRevokeInvitation(inv)}
                  aria-label={`Revoke invitation ${inv.id}`}
                >
                  Revoke
                </Button>
              </li>
            ))}
          </ul>
        )}
      </SettingsSection>
    </div>
  );
}
