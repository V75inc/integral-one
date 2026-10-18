import { PageMeta } from '../components/ui';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { authApi } from '../api/auth';
import { Button } from '../components/ui';
import {
  AUTH_FIELD_INPUT_CLASSES,
  AUTH_FIELD_LABEL_CLASSES,
  AuthPageLayout,
  AuthPanelHeading,
} from '../components/ui/AuthPageLayout';

/**
 * Step 1 of password recovery: user enters their email; we trigger a reset.
 *
 * The backend returns the same generic 200 response regardless of whether
 * an account exists for that address (anti-enumeration), so this page
 * always shows the same confirmation message after submit.
 */
export function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await authApi.forgotPassword(email);
    } catch {
      // Anti-enumeration: same UX regardless of network/server outcome.
    } finally {
      setLoading(false);
      setSubmitted(true);
    }
  };

  return (
    <AuthPageLayout
      title="Forgot your password?"
      description="Enter the email on your account and we'll send you a link to set a new one."
    >

          {submitted ? (
            <>
              <AuthPanelHeading>
                Check your inbox
              </AuthPanelHeading>
              <PageMeta as="p">
                If an account exists for{' '}
                <span className="text-[var(--text)]">{email}</span>, we just
                sent a reset link. It expires in 60 minutes and works only once.
                Don't see it? Check your spam folder.
              </PageMeta>
              <div className="mt-8 flex flex-col gap-2 text-sm text-[var(--text-muted)]">
                <Link
                  to="/login"
                  className="hover:text-[var(--text)] transition-colors duration-fast"
                >
                  ← Back to sign in
                </Link>
                <button
                  type="button"
                  onClick={() => {
                    setSubmitted(false);
                    setEmail('');
                  }}
                  className="text-left hover:text-[var(--text)] transition-colors duration-fast"
                >
                  Use a different email
                </button>
              </div>
            </>
          ) : (
            <>
              <AuthPanelHeading>
                Forgot your password?
              </AuthPanelHeading>
              <PageMeta as="p">
                Enter the email on your account and we'll send you a link to set
                a new one.
              </PageMeta>

              <form onSubmit={handleSubmit} className="mt-8 space-y-5">
                <div>
                  <label htmlFor="forgot-email" className={AUTH_FIELD_LABEL_CLASSES}>
                    Email
                  </label>
                  <input
                    id="forgot-email"
                    type="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    required
                    autoFocus
                    autoComplete="email"
                    placeholder="you@example.com"
                    className={AUTH_FIELD_INPUT_CLASSES}
                  />
                </div>
                <Button
                  variant="primary"
                  size="md"
                  loading={loading}
                  className="w-full mt-1"
                >
                  Send reset link
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
