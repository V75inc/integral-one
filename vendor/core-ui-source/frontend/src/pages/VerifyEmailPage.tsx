import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { Button, Logo } from '../components/ui';
import { authApi } from '../api';

const FIELD_INPUT_CLASSES = `
  w-full px-3.5 py-2.5
  rounded-[var(--radius-input)]
  bg-[var(--panel)] border border-[var(--panel-border)]
  text-[var(--text)] placeholder:text-[var(--text-subtle)]
  hover:border-[var(--text-subtle)]
  focus:outline-none focus:border-[var(--text-muted)] focus:bg-[var(--panel-2)]
  transition-colors duration-fast
  text-center text-[20px] leading-tight tracking-[0.25em] font-mono
`;

const FIELD_LABEL_CLASSES =
  'text-[13px] font-medium uppercase tracking-[0.08em] text-[var(--text-subtle)] block mb-2';

export function VerifyEmailPage() {
  const { user, refreshUser } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [codeError, setCodeError] = useState('');

  const email = user?.email ?? '';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = code.trim().replace(/\s/g, '');
    if (trimmed.length !== 6) {
      setCodeError('Enter the 6-digit code from your email.');
      return;
    }
    setCodeError('');
    setLoading(true);
    try {
      await authApi.verifyEmail(trimmed);
      await refreshUser();
      showToast('Email verified!', 'success');
      navigate('/', { replace: true });
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: string } } })
        ?.response?.data?.detail;
      setCodeError(detail || 'Invalid or expired code.');
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    setResending(true);
    try {
      await authApi.resendVerification();
      showToast('Verification code sent — check your inbox', 'success');
    } catch {
      showToast('Could not send code. Try again shortly.', 'error');
    } finally {
      setResending(false);
    }
  };

  return (
    <div className="min-h-screen bg-[var(--bg)] flex items-center justify-center px-6">
      <div className="w-full max-w-sm">
        <div className="mb-10">
          <Logo to="/" size="md" />
        </div>

        <h2 className="text-[32px] font-semibold tracking-[-0.02em] text-[var(--text)] leading-[1.1]">
          Check your email
        </h2>
        <p className="mt-2 text-sm text-[var(--text-muted)]">
          We sent a 6-digit code to{' '}
          {email ? (
            <strong className="text-[var(--text)]">{email}</strong>
          ) : (
            'your email address'
          )}
          . Enter it below to verify your account.
        </p>

        <form onSubmit={handleSubmit} className="mt-8 space-y-5">
          <div>
            <label htmlFor="verify-code" className={FIELD_LABEL_CLASSES}>
              Verification code
            </label>
            <input
              id="verify-code"
              type="text"
              inputMode="numeric"
              pattern="[0-9 ]*"
              maxLength={7}
              value={code}
              onChange={e => {
                setCode(e.target.value.replace(/[^0-9]/g, ''));
                if (codeError) setCodeError('');
              }}
              autoFocus
              autoComplete="one-time-code"
              placeholder="000000"
              aria-invalid={Boolean(codeError)}
              aria-describedby={codeError ? 'verify-code-error' : undefined}
              className={
                FIELD_INPUT_CLASSES + (codeError ? ' !border-[var(--danger-fg)]' : '')
              }
            />
            {codeError ? (
              <p
                id="verify-code-error"
                role="alert"
                className="mt-2 text-xs text-[var(--danger-fg)] text-center"
              >
                {codeError}
              </p>
            ) : null}
          </div>

          <Button
            variant="primary"
            size="md"
            loading={loading}
            className="w-full"
          >
            Verify email
          </Button>
        </form>

        <div className="mt-6 flex flex-col gap-2 text-sm text-[var(--text-muted)]">
          <p>
            Didn't receive it?{' '}
            <button
              type="button"
              onClick={handleResend}
              disabled={resending}
              className="
                inline-flex items-center cursor-pointer
                text-[var(--text)] underline underline-offset-2
                hover:text-[var(--link-hover)]
                disabled:opacity-50 disabled:cursor-not-allowed
                rounded focus-visible:outline-none
                focus-visible:ring-2 focus-visible:ring-[var(--focus-ring-color)]
              "
            >
              {resending ? 'Sending…' : 'Resend code'}
            </button>
          </p>
          <p>
            <button
              type="button"
              onClick={() => navigate('/', { replace: true })}
              className="
                inline-flex items-center cursor-pointer
                text-[var(--text-subtle)] underline underline-offset-2
                hover:text-[var(--text)] transition-colors
                rounded focus-visible:outline-none
                focus-visible:ring-2 focus-visible:ring-[var(--focus-ring-color)]
              "
            >
              Skip for now
            </button>
          </p>
        </div>
      </div>
    </div>
  );
}
