import { PageMeta } from '../components/ui';
import { useState, useEffect } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Eye, EyeOff } from 'lucide-react';
import { authApi, PasswordResetError } from '../api/auth';
import { useToast } from '../context/ToastContext';
import { Button, LINE_ICON_STROKE } from '../components/ui';
import {
  AUTH_FIELD_INPUT_CLASSES,
  AUTH_FIELD_LABEL_CLASSES,
  AuthPageLayout,
  AuthPanelHeading,
} from '../components/ui/AuthPageLayout';

const PASSWORD_MIN_LENGTH = 12;

/**
 * Step 2 of password recovery: user clicks the link from their email which
 * brings them here with `?token=...`. They enter a new password (twice for
 * confirmation), submit, and on success we redirect them to /login with a
 * toast prompting them to sign in with the new password.
 *
 * Backend errors come through with `error.response.data.detail.error_code`
 * — we map common cases (expired, invalid, attempts exceeded) to specific
 * UI states so the user understands whether to request a new link.
 */
export function ResetPasswordPage() {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') || '';

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [linkBroken, setLinkBroken] = useState<
    null | 'expired' | 'invalid' | 'attempts'
  >(null);

  // If the token is missing entirely, the link itself is broken.
  useEffect(() => {
    if (!token) setLinkBroken('invalid');
  }, [token]);

  const tooShort = password.length > 0 && password.length < PASSWORD_MIN_LENGTH;
  const mismatch = confirm.length > 0 && password !== confirm;
  const canSubmit =
    !!token &&
    password.length >= PASSWORD_MIN_LENGTH &&
    password === confirm &&
    !loading;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setLoading(true);
    try {
      await authApi.resetPassword(token, password);
      setDone(true);
      showToast('Password updated. Sign in with your new password.', 'success');
      // Small delay so the toast is visible before navigation.
      setTimeout(() => navigate('/login', { replace: true }), 800);
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: { error_code?: string; message?: string } } } })
        ?.response?.data?.detail;
      const code = detail?.error_code;
      const message = detail?.message;
      if (code === PasswordResetError.EXPIRED_TOKEN) {
        setLinkBroken('expired');
      } else if (code === PasswordResetError.ATTEMPTS_EXCEEDED) {
        setLinkBroken('attempts');
      } else if (code === PasswordResetError.INVALID_TOKEN) {
        setLinkBroken('invalid');
      } else if (code === PasswordResetError.WEAK_PASSWORD) {
        showToast(message || 'Password is too short.', 'error');
      } else {
        showToast(message || 'Could not reset password. Try again.', 'error');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthPageLayout
      title="Choose a new password"
      description="Choose a new password to get back into your account."
    >

          {linkBroken ? (
            <BrokenLink kind={linkBroken} />
          ) : done ? (
            <Done />
          ) : (
            <>
              <AuthPanelHeading>
                Choose a new password
              </AuthPanelHeading>
              <PageMeta as="p">
                Make it at least {PASSWORD_MIN_LENGTH} characters. You'll be
                signed in with this password from now on.
              </PageMeta>

              <form onSubmit={handleSubmit} className="mt-8 space-y-5">
                <div>
                  <label
                    htmlFor="reset-password"
                    className={AUTH_FIELD_LABEL_CLASSES}
                  >
                    New password
                  </label>
                  <div className="relative">
                    <input
                      id="reset-password"
                      type={showPw ? 'text' : 'password'}
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      required
                      autoFocus
                      autoComplete="new-password"
                      minLength={PASSWORD_MIN_LENGTH}
                      placeholder="••••••••"
                      className={`${AUTH_FIELD_INPUT_CLASSES} pr-11`}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPw(s => !s)}
                      className="auth-password-toggle absolute right-0 top-1/2 -translate-y-1/2 text-[var(--text-subtle)] hover:text-[var(--text)] transition-colors duration-fast"
                      aria-label={showPw ? 'Hide password' : 'Show password'}
                    >
                      {showPw ? (
                        <EyeOff size={16} strokeWidth={LINE_ICON_STROKE} />
                      ) : (
                        <Eye size={16} strokeWidth={LINE_ICON_STROKE} />
                      )}
                    </button>
                  </div>
                  {tooShort && (
                    <p className="mt-2 text-xs text-[var(--danger-fg)]">
                      Must be at least {PASSWORD_MIN_LENGTH} characters.
                    </p>
                  )}
                </div>
                <div>
                  <label
                    htmlFor="reset-confirm"
                    className={AUTH_FIELD_LABEL_CLASSES}
                  >
                    Confirm password
                  </label>
                  <input
                    id="reset-confirm"
                    type={showPw ? 'text' : 'password'}
                    value={confirm}
                    onChange={e => setConfirm(e.target.value)}
                    required
                    autoComplete="new-password"
                    placeholder="••••••••"
                    className={AUTH_FIELD_INPUT_CLASSES}
                  />
                  {mismatch && (
                    <p className="mt-2 text-xs text-[var(--danger-fg)]">
                      Passwords don't match.
                    </p>
                  )}
                </div>
                <Button
                  variant="primary"
                  size="md"
                  loading={loading}
                  disabled={!canSubmit}
                  className="w-full mt-1"
                >
                  Set new password
                </Button>
              </form>

              <p className="mt-6 text-sm text-[var(--text-muted)]">
                <Link
                  to="/login"
                  className="hover:text-[var(--text)] transition-colors duration-fast"
                >
                  ← Back to sign in
                </Link>
              </p>
            </>
          )}
    </AuthPageLayout>
  );
}

function BrokenLink({ kind }: { kind: 'expired' | 'invalid' | 'attempts' }) {
  const title =
    kind === 'expired'
      ? 'This link has expired'
      : kind === 'attempts'
      ? 'Too many attempts'
      : 'This link is invalid';
  const body =
    kind === 'expired'
      ? "Reset links expire 60 minutes after they're sent. Request a fresh one and we'll email it again."
      : kind === 'attempts'
      ? 'For your security, this link has been disabled. Request a new one to continue.'
      : 'This link is no longer valid. It may have been used already, or copied incorrectly. Request a fresh link to continue.';

  return (
    <>
      <AuthPanelHeading>
        {title}
      </AuthPanelHeading>
      <PageMeta as="p">
        {body}
      </PageMeta>
      <div className="mt-8">
        <Link
          to="/forgot-password"
          className="
            inline-flex items-center justify-center w-full
            px-4 py-2.5 text-sm font-medium
            rounded-[var(--radius-input)]
            bg-[var(--cta-bg)] text-[var(--cta-fg)]
            hover:opacity-90 transition-opacity duration-fast
          "
        >
          Request a new link
        </Link>
      </div>
      <p className="mt-6 text-sm text-[var(--text-muted)]">
        <Link
          to="/login"
          className="hover:text-[var(--text)] transition-colors duration-fast"
        >
          ← Back to sign in
        </Link>
      </p>
    </>
  );
}

function Done() {
  return (
    <>
      <AuthPanelHeading>
        Password updated
      </AuthPanelHeading>
      <PageMeta as="p">
        Redirecting you to sign in…
      </PageMeta>
    </>
  );
}
