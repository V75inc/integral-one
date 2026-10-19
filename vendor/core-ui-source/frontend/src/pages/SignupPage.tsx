import { PageMeta } from '../components/ui';
import { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Button } from '../components/ui';
import {
  AUTH_FIELD_INPUT_CLASSES,
  AUTH_FIELD_LABEL_CLASSES,
  AuthPageLayout,
  AuthPanelHeading,
} from '../components/ui/AuthPageLayout';
import { SIGNUP_HEADLINE, SIGNUP_SUBCOPY } from '../brand';
import { safePostAuthRedirect } from '../utils';
import {
  PASSWORD_STRENGTH_LABELS,
  passwordStrength,
  validateSignup,
  type FieldErrors,
} from '../utils/authValidation';

type SignupApiError = {
  response?: { data?: { detail?: string; message?: string } };
};

export function signupErrorMessage(error: unknown): string {
  const data = (error as SignupApiError)?.response?.data;
  const message = data?.message || data?.detail;
  return typeof message === 'string' && message.trim()
    ? message
    : 'Signup failed. Please try again.';
}

export function SignupPage() {
  const { signup } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [workspaceName, setWorkspaceName] = useState('');
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<
    FieldErrors<'displayName' | 'email' | 'password' | 'form'>
  >({});

  const pwStrength = passwordStrength(password);
  const pwStrengthLabel = PASSWORD_STRENGTH_LABELS[pwStrength];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const fieldErrs = validateSignup({ displayName, email, password });
    if (Object.keys(fieldErrs).length > 0) {
      setErrors(fieldErrs);
      return;
    }
    setErrors({});
    setLoading(true);
    try {
      await signup(
        email,
        password,
        displayName,
        workspaceName.trim() || undefined,
      );
      const from = (location.state as { from?: typeof location } | null)?.from;
      const returnPath = safePostAuthRedirect(from);
      const pendingInvite = returnPath.startsWith('/invitations/');
      navigate(
        pendingInvite ? returnPath : '/verify-email',
        { replace: true },
      );
    } catch (err: unknown) {
      setErrors({
        form: signupErrorMessage(err),
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthPageLayout
      title={
        <>
          {SIGNUP_HEADLINE[0]}
          <br />
          {SIGNUP_HEADLINE[1]}
        </>
      }
      description={SIGNUP_SUBCOPY}
    >
          <AuthPanelHeading>
            Create your account
          </AuthPanelHeading>
          <PageMeta as="p">
            Your workspace is created automatically. Optionally name your collaborative workspace below.
          </PageMeta>

          <form onSubmit={handleSubmit} className="mt-8 space-y-5">
            <div>
              <label htmlFor="signup-name" className={AUTH_FIELD_LABEL_CLASSES}>
                Display name
              </label>
              <input
                id="signup-name"
                value={displayName}
                onChange={e => {
                  setDisplayName(e.target.value);
                  if (errors.displayName) setErrors(p => ({ ...p, displayName: undefined }));
                }}
                autoComplete="name"
                placeholder="Your name"
                aria-invalid={Boolean(errors.displayName)}
                aria-describedby={errors.displayName ? 'signup-name-error' : undefined}
                className={AUTH_FIELD_INPUT_CLASSES + (errors.displayName ? ' !border-[var(--danger-fg)]' : '')}
              />
              {errors.displayName ? (
                <p id="signup-name-error" role="alert" className="mt-1.5 text-xs text-[var(--danger-fg)]">
                  {errors.displayName}
                </p>
              ) : null}
            </div>
            <div>
              <label htmlFor="signup-email" className={AUTH_FIELD_LABEL_CLASSES}>
                Email
              </label>
              <input
                id="signup-email"
                type="email"
                value={email}
                onChange={e => {
                  setEmail(e.target.value);
                  if (errors.email) setErrors(p => ({ ...p, email: undefined }));
                }}
                autoComplete="email"
                placeholder="you@example.com"
                aria-invalid={Boolean(errors.email)}
                aria-describedby={errors.email ? 'signup-email-error' : undefined}
                className={AUTH_FIELD_INPUT_CLASSES + (errors.email ? ' !border-[var(--danger-fg)]' : '')}
              />
              {errors.email ? (
                <p id="signup-email-error" role="alert" className="mt-1.5 text-xs text-[var(--danger-fg)]">
                  {errors.email}
                </p>
              ) : null}
            </div>
            <div>
              <label htmlFor="signup-password" className={AUTH_FIELD_LABEL_CLASSES}>
                Password
              </label>
              <input
                id="signup-password"
                type="password"
                value={password}
                onChange={e => {
                  setPassword(e.target.value);
                  if (errors.password) setErrors(p => ({ ...p, password: undefined }));
                }}
                autoComplete="new-password"
                placeholder="At least 12 characters"
                aria-invalid={Boolean(errors.password)}
                aria-describedby={errors.password ? 'signup-password-error' : 'signup-password-strength'}
                className={AUTH_FIELD_INPUT_CLASSES + (errors.password ? ' !border-[var(--danger-fg)]' : '')}
              />
              {password.length > 0 && !errors.password ? (
                <div id="signup-password-strength" className="mt-2 flex items-center gap-2">
                  <div className="flex-1 flex gap-1" aria-hidden>
                    {[0, 1, 2, 3].map(i => (
                      <span
                        key={i}
                        className={`h-1 flex-1 rounded-full ${
                          i < pwStrength
                            ? pwStrength <= 1
                              ? 'bg-[var(--danger-fg)]'
                              : pwStrength === 2
                                ? 'bg-[var(--warn-fg)]'
                                : 'bg-[var(--success-fg,#16a34a)]'
                            : 'bg-[var(--panel-border)]'
                        }`}
                      />
                    ))}
                  </div>
                  <span className="text-[11px] text-[var(--text-muted)] tabular-nums">
                    {pwStrengthLabel}
                  </span>
                </div>
              ) : null}
              {errors.password ? (
                <p id="signup-password-error" role="alert" className="mt-1.5 text-xs text-[var(--danger-fg)]">
                  {errors.password}
                </p>
              ) : null}
            </div>
            <div>
              <label htmlFor="signup-workspace" className={AUTH_FIELD_LABEL_CLASSES}>
                Collaborative workspace (optional)
              </label>
              <input
                id="signup-workspace"
                value={workspaceName}
                onChange={e => setWorkspaceName(e.target.value)}
                autoComplete="organization"
                placeholder="Your company or team"
                className={AUTH_FIELD_INPUT_CLASSES}
              />
              <p className="mt-1.5 text-xs text-[var(--text-subtle)]">
                If provided, we’ll create a company workspace alongside your
                personal one and make you the owner.
              </p>
            </div>
            {errors.form ? (
              <p role="alert" className="text-xs text-[var(--danger-fg)] -mt-2">
                {errors.form}
              </p>
            ) : null}
            <Button
              variant="primary"
              size="md"
              loading={loading}
              className="w-full mt-1"
            >
              Create account
            </Button>
          </form>

          <p className="mt-6 text-sm text-[var(--text-muted)]">
            Already have an account?{' '}
            <Link
              to="/login"
              state={location.state}
              className="text-[var(--text)] underline hover:text-[var(--link-hover)]"
            >
              Sign in
            </Link>
          </p>
    </AuthPageLayout>
  );
}
