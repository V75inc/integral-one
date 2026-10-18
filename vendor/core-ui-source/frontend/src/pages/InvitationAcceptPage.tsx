import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { invitationsApi } from '../api';
import { Button, PageHeading, PageMeta, Skeleton } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import type { InvitationPreview } from '../api/invitations';
import { invitationAcceptanceMessage } from '../utils/invitationAcceptance';

const NON_RETRYABLE_CODES = new Set([
  'invitation.token_invalid',
  'invitation.revoked',
  'invitation.declined',
  'invitation.consumed',
  'invitation.token_expired',
]);

function explainError(code?: string | null): string | null {
  if (!code) return null;
  switch (code) {
    case 'invitation.token_invalid':
      return 'This invitation link is not valid.';
    case 'invitation.token_expired':
      return 'This invitation has expired.';
    case 'invitation.revoked':
      return 'This invitation was revoked.';
    case 'invitation.declined':
      return 'This invitation was already declined.';
    case 'invitation.consumed':
      return 'This invitation has already been used.';
    default:
      return code;
  }
}

export function InvitationAcceptPage() {
  const { token = '' } = useParams<{ token: string }>();
  const { user, loading: authLoading } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const [preview, setPreview] = useState<InvitationPreview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [working, setWorking] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const p = await invitationsApi.preview(token);
      setPreview(p);
    } catch (e: unknown) {
      const status =
        (e as { response?: { status?: number } })?.response?.status ?? 0;
      const detail =
        (e as { response?: { data?: { detail?: string } } })?.response?.data
          ?.detail || (e as Error)?.message;
      setError(
        status === 404 ? 'This invitation link is not valid.' : String(detail || 'Failed to load')
      );
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    if (token) load();
  }, [token, load]);

  const accept = async () => {
    if (!user) {
      // Bounce through auth; LoginPage reads location.state.from to return here.
      navigate('/login', {
        state: { from: { pathname: `/invitations/${token}` } },
      });
      return;
    }
    setWorking(true);
    try {
      const res = await invitationsApi.accept(token);
      showToast(invitationAcceptanceMessage(res.role, res.invitation.grant_receipt), res.role ? 'success' : 'error');
      qc.invalidateQueries({ queryKey: ['workspaces'] });
      navigate(res.role ? `/workspaces/${res.invitation.workspace_id}` : '/');
    } catch (e: unknown) {
      const detail =
        (e as { response?: { data?: { detail?: string } } })?.response?.data
          ?.detail || 'Could not accept invitation';
      showToast(String(detail), 'error');
    } finally {
      setWorking(false);
    }
  };

  const decline = async () => {
    setWorking(true);
    try {
      await invitationsApi.decline(token);
      showToast('Invitation declined', 'success');
      navigate('/');
    } catch (e: unknown) {
      const detail =
        (e as { response?: { data?: { detail?: string } } })?.response?.data
          ?.detail || 'Could not decline invitation';
      showToast(String(detail), 'error');
    } finally {
      setWorking(false);
    }
  };

  if (authLoading || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <Skeleton className="h-40 w-full max-w-md rounded-lg" />
      </div>
    );
  }

  if (error || !preview) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="app-card max-w-md w-full p-6 text-center">
          <PageHeading>Invitation</PageHeading>
          <p className="mt-4 text-sm text-[var(--danger-fg)]">
            {error || 'Invitation not found.'}
          </p>
          <Button
            variant="secondary"
            className="mt-6 w-full"
            onClick={() => navigate('/')}
          >
            Go home
          </Button>
        </div>
      </div>
    );
  }

  const inv = preview.invitation;
  const workspace = preview.workspace;
  const errCode = preview.error_code || null;
  const terminal = errCode ? NON_RETRYABLE_CODES.has(errCode) : false;

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="app-card max-w-md w-full p-6">
        <PageHeading>Join {workspace?.name || 'workspace'}</PageHeading>
        <PageMeta as="p">
          You've been invited to <strong>{workspace?.name || 'a workspace'}</strong> as a{' '}
          <strong>{inv.role}</strong>.
        </PageMeta>
        {inv.message ? (
          <blockquote className="mt-4 border-l-2 border-[var(--panel-border)] pl-3 text-sm text-[var(--text-muted)] italic">
            "{inv.message}"
          </blockquote>
        ) : null}
        {workspace?.description ? (
          <p className="mt-4 text-sm text-[var(--text)]">{workspace.description}</p>
        ) : null}

        {terminal ? (
          <p className="mt-6 text-sm text-[var(--danger-fg)]">
            {explainError(errCode)}
          </p>
        ) : (
          <div className="mt-6 grid grid-cols-2 gap-3">
            <Button
              variant="secondary"
              onClick={decline}
              disabled={working}
            >
              Decline
            </Button>
            <Button
              variant="primary"
              onClick={accept}
              disabled={working}
            >
              {user ? 'Accept' : 'Sign in to accept'}
            </Button>
          </div>
        )}

        {!user && !terminal ? (
          <p className="mt-4 text-center text-sm text-[var(--text-muted)]">
            New to Integral?{' '}
            <button
              type="button"
              className="text-[var(--link)] hover:text-[var(--link-hover)] underline"
              onClick={() =>
                navigate('/signup', {
                  state: { from: { pathname: `/invitations/${token}` } },
                })
              }
            >
              Create an account
            </button>
          </p>
        ) : null}

        {inv.expires_at && !terminal ? (
          <p className="mt-4 text-xs text-[var(--text-subtle)]">
            Expires {inv.expires_at.slice(0, 10)}
          </p>
        ) : null}
      </div>
    </div>
  );
}
