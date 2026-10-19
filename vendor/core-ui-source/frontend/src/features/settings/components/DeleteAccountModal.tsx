import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Trash2 } from 'lucide-react';
import { usersApi, type AccountDeletionPreview } from '../../../api/users';
import { useAuth } from '../../../context/AuthContext';
import { Button, LINE_ICON_STROKE } from '../../../components/ui';
import { Input, Text } from '../../../ui';

interface DeleteAccountModalProps {
  open: boolean;
  userId: string;
  accountEmail: string;
  onClose: () => void;
}

export function DeleteAccountModal({
  open,
  userId,
  accountEmail,
  onClose,
}: DeleteAccountModalProps) {
  const { logout } = useAuth();
  const navigate = useNavigate();
  const [preview, setPreview] = useState<AccountDeletionPreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [confirmEmail, setConfirmEmail] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setConfirmEmail('');
    setDeleteError(null);
    setPreviewError(null);
    setPreviewLoading(true);
    usersApi
      .getAccountDeletionPreview()
      .then(setPreview)
      .catch(() => {
        setPreviewError('Could not load deletion preview. Please try again.');
      })
      .finally(() => setPreviewLoading(false));
  }, [open]);

  if (!open) return null;

  const emailForConfirm = preview?.email || accountEmail;
  const canSubmit =
    preview?.can_delete === true &&
    confirmEmail.trim().toLowerCase() === emailForConfirm.trim().toLowerCase();

  async function handleDelete() {
    if (!canSubmit || deleting) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      await usersApi.deleteAccount(userId, confirmEmail.trim());
      await logout();
      navigate('/login', { replace: true, state: { accountDeleted: true } });
    } catch (err: unknown) {
      const resp = (err as { response?: { data?: { message?: string; details?: { blockers?: Array<{ message: string }> } } } })
        ?.response?.data;
      if (resp?.details?.blockers?.length) {
        setDeleteError(resp.details.blockers.map(b => b.message).join(' '));
      } else {
        setDeleteError(resp?.message || 'Could not delete your account. Please try again.');
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
      aria-label="Confirm account deletion"
      onClick={e => {
        if (e.target === e.currentTarget && !deleting) onClose();
      }}
    >
      <div className="bg-[var(--surface)] rounded-[var(--radius-dialog,12px)] shadow-2xl w-full max-w-lg p-6 space-y-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--danger-bg,#fef2f2)]">
            <Trash2
              size={15}
              className="text-[var(--danger-fg,#b91c1c)]"
              strokeWidth={LINE_ICON_STROKE}
            />
          </span>
          <div>
            <Text variant="heading-md" weight="semibold" as="h2">
              Delete your account?
            </Text>
            <Text variant="body" tone="muted" as="p" className="mt-1">
              This permanently removes your profile, personal workspace, chat
              history, connected agents, and sign-in credentials. This cannot
              be undone.
            </Text>
          </div>
        </div>

        {previewLoading ? (
          <Text variant="body" tone="muted" as="p">Loading impact summary…</Text>
        ) : null}

        {previewError ? (
          <p className="text-xs text-[var(--danger-fg,#b91c1c)]" role="alert">
            {previewError}
          </p>
        ) : null}

        {preview && !previewLoading ? (
          <>
            {preview.blockers.length > 0 ? (
              <div
                className="rounded-[var(--radius-card)] border border-[color:var(--danger-fg,#ef4444)]/30 bg-[var(--danger-bg,#fef2f2)] px-4 py-3 space-y-2"
                role="alert"
              >
                <p className="text-sm font-medium text-[var(--danger-fg,#b91c1c)]">
                  Resolve these issues before deleting your account
                </p>
                <Text
                  variant="body-sm"
                  tone="muted"
                  as="ul"
                  className="space-y-1.5 list-disc pl-4"
                >
                  {preview.blockers.map(blocker => (
                    <li key={blocker.code}>{blocker.message}</li>
                  ))}
                </Text>
              </div>
            ) : (
              <div className="space-y-2">
                <Text
                  variant="body-sm"
                  weight="medium"
                  tone="subtle"
                  as="p"
                  className="uppercase tracking-wide"
                >
                  What will happen
                </Text>
                <Text
                  variant="body-sm"
                  tone="muted"
                  as="ul"
                  className="space-y-1 list-disc pl-4"
                >
                  {preview.impact.map(line => (
                    <li key={line}>{line}</li>
                  ))}
                </Text>
              </div>
            )}
          </>
        ) : null}

        {preview?.can_delete !== false && !previewLoading && !previewError ? (
          <div>
            {/* `<Text>` has no `htmlFor`, so the label stays an element and
                carries the typography as a child. */}
            <label htmlFor="account-delete-confirm-email" className="block mb-1.5">
              <Text variant="body-sm" weight="medium" tone="subtle">
                Type{' '}
                <Text as="strong" variant="body-sm" weight="medium">
                  {emailForConfirm}
                </Text>{' '}
                to confirm
              </Text>
            </label>
            {/* An <input> renders no child node, so <Text> cannot carry its
                typography. The `Input` primitive owns it instead — which
                also drops this field's one-off `--input-bg` / `--border`
                tokens in favour of the app-wide input styling. */}
            <Input
              id="account-delete-confirm-email"
              type="email"
              autoComplete="off"
              className="w-full disabled:opacity-50"
              value={confirmEmail}
              onChange={e => setConfirmEmail(e.target.value)}
              disabled={deleting}
              placeholder={emailForConfirm}
              autoFocus
            />
          </div>
        ) : null}

        {deleteError ? (
          <p className="text-xs text-[var(--danger-fg,#b91c1c)]" role="alert">
            {deleteError}
          </p>
        ) : null}

        <div className="flex justify-end gap-2 pt-1">
          <Button variant="ghost" size="sm" onClick={onClose} disabled={deleting}>
            Cancel
          </Button>
          {preview?.can_delete !== false && !previewLoading && !previewError ? (
            <Button
              variant="danger"
              size="sm"
              onClick={handleDelete}
              disabled={deleting || !canSubmit}
            >
              {deleting ? 'Deleting…' : 'Delete account'}
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
