import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { authApi, sharingApi } from '../api';
import { errorMessageFromAxios } from '../api/helpers';
import type { MyInvitation } from '../api/sharing';
import { Button, PageMeta, Skeleton } from '../components/ui';
import { Text } from '../ui';
import { useToast } from '../context/ToastContext';
import { useAuth } from '../context/AuthContext';
import { usePublishPageContext } from '../hooks/usePublishPageContext';
import { invitationAcceptanceMessage } from '../utils/invitationAcceptance';

export function InvitationReceivedPage() {
  const { invitationId = '' } = useParams<{ invitationId: string }>();
  const { user, loading: authLoading, refreshUser } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const qc = useQueryClient();

  usePublishPageContext({ pageKind: 'invitation_received' });
  const [invitation, setInvitation] = useState<MyInvitation | null>(null);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const beginVerification = async () => {
    if (working) return;
    setWorking(true);
    const enterCode = () => navigate('/verify-email', {
      state: { returnTo: `/invitations/received/${encodeURIComponent(invitationId)}` },
    });
    try {
      const result = await authApi.resendVerification();
      if (result.status === 'already_verified') {
        await refreshUser();
        return;
      }
      showToast(result.message || 'Verification code sent — check your inbox', 'success');
      enterCode();
    } catch (failure) {
      const status = (failure as { response?: {status?: number} })?.response?.status;
      showToast(errorMessageFromAxios(failure, 'Could not send a verification code. Try again shortly.'), status === 429 ? 'info' : 'error');
      // A recently requested code remains usable during the resend cooldown.
      if (status === 429) enterCode();
    } finally {
      setWorking(false);
    }
  };

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const rows = await sharingApi.listMyInvitations();
      const match = rows.find(i => i.id === invitationId);
      if (!match) {
        setError('This invitation is not available or has already been handled.');
        setInvitation(null);
        return;
      }
      setInvitation(match);
    } catch {
      setError('Failed to load invitation.');
      setInvitation(null);
    } finally {
      setLoading(false);
    }
  }, [invitationId]);

  useEffect(() => {
    if (invitationId && !authLoading && user?.email_verified === true) load();
  }, [invitationId, load, authLoading, user?.email_verified]);

  const accept = async () => {
    if (!invitation) return;
    setWorking(true);
    try {
      const res = await sharingApi.acceptMyInvitation(invitation.id);
      showToast(invitationAcceptanceMessage(res.role, res.grant_receipt), res.role ? 'success' : 'error');
      await qc.invalidateQueries({ queryKey: ['workspaces'] });
      navigate(res.role && res.workspace?.id ? `/workspaces/${res.workspace.id}` : '/');
    } catch (e: unknown) {
      const detail =
        (e as { response?: { data?: { message?: string; detail?: string } } })
          ?.response?.data?.message
        || (e as { response?: { data?: { detail?: string } } })?.response?.data
          ?.detail
        || 'Could not accept invitation';
      showToast(String(detail), 'error');
    } finally {
      setWorking(false);
    }
  };

  const decline = async () => {
    if (!invitation) return;
    setWorking(true);
    try {
      await sharingApi.declineMyInvitation(invitation.id);
      showToast('Invitation declined', 'success');
      navigate('/');
    } catch (e: unknown) {
      const detail =
        (e as { response?: { data?: { message?: string; detail?: string } } })
          ?.response?.data?.message
        || (e as { response?: { data?: { detail?: string } } })?.response?.data
          ?.detail
        || 'Could not decline invitation';
      showToast(String(detail), 'error');
    } finally {
      setWorking(false);
    }
  };

  if (!authLoading && user && user.email_verified !== true) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="app-card max-w-md w-full p-6 text-center">
          <Text as="h1" variant="heading-lg" className="break-words">Verify your email</Text>
          <PageMeta as="p" className="mt-4">
            To accept this invitation, verify your email first. You’ll return here
            to review and accept it.
          </PageMeta>
          <Button
            className="mt-6 w-full"
            disabled={working}
            onClick={() => void beginVerification()}
          >
            Verify email
          </Button>
        </div>
      </div>
    );
  }

  if (authLoading || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <Skeleton className="h-40 w-full max-w-md rounded-lg" />
      </div>
    );
  }

  if (error || !invitation) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="app-card max-w-md w-full p-6 text-center">
          <Text as="h1" variant="heading-lg" className="break-words">Invitation</Text>
          <p className="mt-4 text-sm text-[var(--danger-fg)]">
            {error || 'Invitation not found.'}
          </p>
          <Button variant="secondary" className="mt-6 w-full" onClick={() => navigate('/')}>
            Go home
          </Button>
        </div>
      </div>
    );
  }

  const targetLabel = invitation.target_resource_type
    ? `${invitation.target_resource_type} access`
    : invitation.workspace_name || 'a workspace';
  const role = invitation.target_resource_role || invitation.role;

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="app-card max-w-md w-full p-6">
        <Text as="h1" variant="heading-lg" className="break-words">Join {targetLabel}</Text>
        <PageMeta as="p">
          You've been invited to <strong>{targetLabel}</strong> as a{' '}
          <strong>{role}</strong>.
        </PageMeta>
        {invitation.message ? (
          <Text
            variant="body-sm"
            tone="muted"
            as="blockquote"
            className="mt-4 block border-l-2 border-[var(--panel-border)] pl-3 italic"
          >
            "{invitation.message}"
          </Text>
        ) : null}
        <div className="mt-6 grid grid-cols-2 gap-3">
          <Button variant="secondary" onClick={decline} disabled={working}>
            Decline
          </Button>
          <Button variant="primary" onClick={accept} disabled={working}>
            Accept
          </Button>
        </div>
        {invitation.expires_at ? (
          <Text variant="meta" tone="subtle" as="p" className="mt-4 block">
            Expires {invitation.expires_at.slice(0, 10)}
          </Text>
        ) : null}
      </div>
    </div>
  );
}
