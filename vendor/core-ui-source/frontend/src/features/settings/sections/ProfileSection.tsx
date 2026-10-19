import { useDeployment } from '../../../hooks/useDeployment';
import { TimezoneSetting } from './TimezoneSetting';
import { PageMeta } from '../../../components/ui';
import { useEffect, useState } from 'react';
import { Trash2 } from 'lucide-react';
import { authApi } from '../../../api';
import { useAuth } from '../../../context/AuthContext';
import { useToast } from '../../../context/ToastContext';
import { Avatar } from '../../../components/ui/Avatar';
import { Button, LINE_ICON_STROKE } from '../../../components/ui';
import { DeleteAccountModal } from '../components/DeleteAccountModal';

/**
 * Settings → Profile — display name + email + avatar.
 *
 * B-SET-01 from the V1 review: previously the Settings page had no
 * Profile / Account section, so users couldn't change their display
 * name, email, or avatar from anywhere in-product. This section closes
 * the surface gap.
 *
 * Wires up:
 *   - PUT /auth/update-profile     (display_name)
 *   - POST /users/{id}/avatar      (avatar upload; existing endpoint)
 *
 * Password change is deferred — backend has /auth/forgot-password +
 * /auth/reset-password as the user-initiated flow; the section
 * surfaces that link rather than introducing a new in-product
 * password-change endpoint.
 */
export function ProfileSection() {
  const { singleUser } = useDeployment();
  const { user, refreshUser } = useAuth();
  const { showToast } = useToast();
  const [displayName, setDisplayName] = useState(user?.display_name || '');
  const [bio, setBio] = useState(
    user?.bio || (user?.preferences?.bio as string) || '',
  );
  const [savingName, setSavingName] = useState(false);
  const [savingBio, setSavingBio] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);

  useEffect(() => {
    setDisplayName(user?.display_name || '');
  }, [user?.display_name]);

  useEffect(() => {
    setBio(user?.bio || (user?.preferences?.bio as string) || '');
  }, [user?.bio, user?.preferences?.bio]);

  const dirty = displayName.trim() !== (user?.display_name || '').trim();
  const savedBio = user?.bio || (user?.preferences?.bio as string) || '';
  const bioDirty = bio.trim() !== savedBio.trim();

  async function saveDisplayName() {
    if (!dirty || savingName) return;
    setSavingName(true);
    try {
      await authApi.updateProfile({ display_name: displayName.trim() });
      await refreshUser();
      showToast('Profile updated.', 'success');
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: string } } })
        ?.response?.data?.detail;
      showToast(detail || 'Could not save profile.', 'error');
    } finally {
      setSavingName(false);
    }
  }

  async function saveBio() {
    if (!bioDirty || savingBio) return;
    setSavingBio(true);
    try {
      await authApi.updateProfile({
        preferences: { bio: bio.trim() },
      });
      await refreshUser();
      showToast('Bio updated.', 'success');
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: string } } })
        ?.response?.data?.detail;
      showToast(detail || 'Could not save bio.', 'error');
    } finally {
      setSavingBio(false);
    }
  }

  async function onAvatarPicked(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !user) return;
    if (file.size > 4 * 1024 * 1024) {
      showToast('Avatar too large — please use an image under 4 MB.', 'error');
      return;
    }
    setUploadingAvatar(true);
    try {
      const { usersApi } = await import('../../../api/users');
      await usersApi.uploadAvatar(user.id || user.user_id || '', file);
      await refreshUser();
      showToast('Avatar updated.', 'success');
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: string } } })
        ?.response?.data?.detail;
      showToast(detail || 'Could not upload avatar.', 'error');
    } finally {
      setUploadingAvatar(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-lg font-semibold text-[var(--text)]">Profile</h2>
        <PageMeta as="p">
          The name, avatar, and email that appear across Integral and to
          collaborators.
        </PageMeta>
      </div>

      {/* Avatar */}
      <section className="rounded-[var(--radius-card)] border border-[var(--panel-border)] bg-[var(--panel)] p-4">
        <h3 className="text-sm font-medium text-[var(--text)]">Avatar</h3>
        <div className="mt-3 flex items-center gap-4">
          <Avatar
            name={user?.display_name || ''}
            attachmentId={user?.avatar_attachment_id}
            userId={user?.id || user?.user_id}
            version={user?.updated_at}
            size="lg"
          />
          <label
            className="
              inline-flex items-center cursor-pointer
              rounded-[var(--radius-input)] border border-[var(--panel-border)]
              bg-[var(--panel-2)] px-3 py-1.5 text-sm text-[var(--text)]
              hover:bg-[var(--panel)] transition-colors
              focus-within:ring-2 focus-within:ring-[var(--focus-ring-color)]
            "
          >
            {uploadingAvatar ? 'Uploading…' : 'Upload new image'}
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="sr-only"
              onChange={onAvatarPicked}
              disabled={uploadingAvatar}
            />
          </label>
        </div>
        <p className="mt-2 text-xs text-[var(--text-subtle)]">
          Square PNG / JPEG / WebP up to 4 MB. We'll resize to standard
          variants (32 / 64 / 128 / 256 px).
        </p>
      </section>

      {/* Display name */}
      <section className="rounded-[var(--radius-card)] border border-[var(--panel-border)] bg-[var(--panel)] p-4 flex flex-col gap-3">
        <div>
          <label
            htmlFor="profile-display-name"
            className="text-sm font-medium text-[var(--text)] block"
          >
            Display name
          </label>
          <p className="mt-0.5 text-xs text-[var(--text-muted)]">
            {singleUser ? 'The name shown on your local records.' : 'How collaborators see you in feeds, mentions, and access lists.'}
          </p>
        </div>
        <input
          id="profile-display-name"
          type="text"
          value={displayName}
          onChange={e => setDisplayName(e.target.value)}
          placeholder="Your name"
          className="
            w-full px-3 py-2 text-sm
            rounded-[var(--radius-input)]
            bg-[var(--panel-2)] border border-[var(--panel-border)]
            text-[var(--text)] placeholder:text-[var(--text-subtle)]
            hover:border-[var(--text-subtle)]
            focus:outline-none focus:border-[var(--text-muted)] focus:bg-[var(--panel)]
            transition-colors duration-fast
          "
        />
        <div className="flex justify-end">
          <Button
            variant="primary"
            size="sm"
            disabled={!dirty || savingName || displayName.trim().length === 0}
            loading={savingName}
            onClick={saveDisplayName}
          >
            Save name
          </Button>
        </div>
      </section>

      {!singleUser && <>
      {/* Email — read-only */}
      <section className="rounded-[var(--radius-card)] border border-[var(--panel-border)] bg-[var(--panel)] p-4">
        <label className="text-sm font-medium text-[var(--text)] block">
          Email
        </label>
        <p className="mt-0.5 text-xs text-[var(--text-muted)]">
          The address you sign in with and where verification + reset
          messages are sent.
        </p>
        <p className="mt-3 text-sm text-[var(--text)] tabular-nums">
          {user?.email || (
            <span className="italic text-[var(--text-subtle)]">
              (not set)
            </span>
          )}
        </p>
        {user?.email_verified === false ? (
          <p className="mt-1 text-xs text-[var(--warn-fg)]">
            Email not verified.{' '}
            <a
              href="/verify-email"
              className="underline hover:text-[var(--text)]"
            >
              Verify now
            </a>
          </p>
        ) : null}
      </section>

      {/* Password */}
      <section className="rounded-[var(--radius-card)] border border-[var(--panel-border)] bg-[var(--panel)] p-4">
        <h3 className="text-sm font-medium text-[var(--text)]">Password</h3>
        <p className="mt-1 text-xs text-[var(--text-muted)]">
          We use a single password-reset flow for security. Sign out and
          use{' '}
          <a
            href="/forgot-password"
            className="underline hover:text-[var(--text)]"
          >
            Forgot your password?
          </a>{' '}
          on the sign-in page to set a new one.
        </p>
      </section>

      </>}
      <TimezoneSetting />

      {/* Bio */}
      <section className="rounded-[var(--radius-card)] border border-[var(--panel-border)] bg-[var(--panel)] p-4 flex flex-col gap-3">
        <div>
          <label
            htmlFor="profile-bio"
            className="text-sm font-medium text-[var(--text)] block"
          >
            Bio
          </label>
          <p className="mt-0.5 text-xs text-[var(--text-muted)]">
            A short introduction for your Integral profile.
          </p>
        </div>
        <textarea
          id="profile-bio"
          value={bio}
          onChange={e => setBio(e.target.value)}
          rows={4}
          placeholder="Tell us about yourself…"
          className="
            w-full px-3 py-2 text-sm resize-none
            rounded-[var(--radius-input)]
            bg-[var(--panel-2)] border border-[var(--panel-border)]
            text-[var(--text)] placeholder:text-[var(--text-subtle)]
            hover:border-[var(--text-subtle)]
            focus:outline-none focus:border-[var(--text-muted)] focus:bg-[var(--panel)]
            transition-colors duration-fast
          "
        />
        <div className="flex justify-end">
          <Button
            variant="primary"
            size="sm"
            disabled={!bioDirty || savingBio}
            loading={savingBio}
            onClick={saveBio}
          >
            Save bio
          </Button>
        </div>
      </section>

      {!singleUser && <>
      {/* Danger zone — permanent account deletion */}
      <section>
        <h3 className="text-[13px] uppercase tracking-[0.16em] text-[var(--text-subtle)] font-medium mb-3">
          Danger zone
        </h3>
        <div className="rounded-[var(--radius-card)] border border-[color:var(--danger-fg,#ef4444)]/30 bg-[var(--danger-bg,#fef2f2)] px-5 py-4 flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
          <div>
            <p className="text-sm font-medium text-[var(--danger-fg,#b91c1c)]">
              Delete account
            </p>
            <p className="text-xs text-[var(--text-muted)] mt-0.5 max-w-prose">
              Permanently removes your personal workspace, profile, chat
              history, connected agents, and sign-in credentials. Content you
              contributed in shared workspaces may remain without your name
              attached.
            </p>
          </div>
          <Button
            variant="danger"
            size="sm"
            icon={<Trash2 size={14} strokeWidth={LINE_ICON_STROKE} />}
            onClick={() => setShowDeleteModal(true)}
          >
            Delete account
          </Button>
        </div>
      </section>

      <DeleteAccountModal
        open={showDeleteModal}
        userId={user?.id || user?.user_id || ''}
        accountEmail={user?.email || ''}
        onClose={() => setShowDeleteModal(false)}
      />
      </>}
    </div>
  );
}
