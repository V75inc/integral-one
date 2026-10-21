import { useEffect, useRef, useState, type FormEvent } from 'react';
import axios from 'axios';
import { LockKeyhole } from 'lucide-react';
import { Button } from '../ui/Button';
import { Logo } from '../ui/Logo';
import { Input, Surface, Text } from '../../ui';
import { getHostSession } from '../../host/session';
import { renewSession } from '../../api/sessionRenewal';
import { getRecoveryAccountId, type SessionRecovery } from '../../api/sessionRecovery';
import { getSessionGeneration, type TokenPayload } from '../../api/session';
import type { User } from '../../types';

interface Props {
  mode: Exclude<SessionRecovery, null>;
  user: User;
  onResume(tokens: TokenPayload, user: User): void;
  onSignOut(): void;
}

/** Native top-layer modal also makes existing portalled editors/docks inert. */
export function SessionRenewalDialog({ mode, user, onResume, onSignOut }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const mounted = useRef(true);
  const pending = useRef(false);
  const needsPassword = mode === 'signin' && !getHostSession();

  useEffect(() => {
    mounted.current = true;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const element = dialog.current;
    const preventDismissal = (event: Event) => event.preventDefault();
    const restoreLock = () => {
      if (mounted.current && element && !element.open) {
        element.showModal();
        element.querySelector<HTMLElement>('input[type="password"]:not(:disabled), button[type="submit"]:not(:disabled)')?.focus();
      }
    };
    element?.addEventListener('cancel', preventDismissal);
    element?.addEventListener('close', restoreLock);
    element?.showModal();
    return () => {
      mounted.current = false;
      element?.removeEventListener('cancel', preventDismissal);
      element?.removeEventListener('close', restoreLock);
      element?.close();
      previouslyFocused?.focus({ preventScroll: true });
    };
  }, []);

  useEffect(() => {
    if (busy) return;
    dialog.current?.querySelector<HTMLElement>(needsPassword ? 'input[type="password"]' : 'button[type="submit"]')?.focus();
  }, [needsPassword, busy]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setError('');
    try {
      const result = await renewSession(user.id, needsPassword
        ? { email: user.email ?? '', password } : undefined);
      if (mounted.current && result.generation === getSessionGeneration()
          && getRecoveryAccountId() === user.id) onResume(result.tokens, result.user);
    } catch (failure) {
      if (!mounted.current) return;
      const status = axios.isAxiosError(failure) ? failure.response?.status : undefined;
      setError(status === 401 ? 'Your password was not accepted. Please try again.'
        : status === 429 ? 'Too many attempts. Wait a moment before trying again.'
        : axios.isAxiosError(failure) ? 'Integral could not renew your session. Check your connection and try again.'
        : failure instanceof Error ? failure.message : 'Please try again.');
    } finally {
      pending.current = false;
      // Passwords live only in this form and are discarded after every attempt.
      if (mounted.current) { setPassword(''); setBusy(false); }
    }
  };

  return (
    <dialog ref={dialog} className="session-renewal-dialog" aria-labelledby="session-renewal-title"
      aria-describedby="session-renewal-description" onCancel={event => event.preventDefault()}>
      <Surface padding="lg" elevation="pop">
        <form onSubmit={submit} className="space-y-5">
          <div className="flex items-center justify-between gap-4">
            <Logo size="md" />
            <Text as="span" tone="muted"><LockKeyhole aria-hidden="true" size={20} /></Text>
          </div>
          <Text as="h2" variant="heading-md" id="session-renewal-title">
            {needsPassword ? 'Sign in to continue' : 'Are you still working?'}
          </Text>
          <Text as="p" tone="muted" id="session-renewal-description">
            Your work is still open.
            {needsPassword ? ' Confirm your password to continue.' : ' Continue when you’re ready.'}
          </Text>
          {needsPassword && <div className="space-y-3">
            <Text as="label" variant="label" htmlFor="session-renewal-email">Email</Text>
            <Input id="session-renewal-email" name="username" type="email" autoComplete="username" value={user.email ?? ''} readOnly />
            <Text as="label" variant="label" htmlFor="session-renewal-password">Password</Text>
            <Input id="session-renewal-password" name="password" type="password" autoComplete="current-password"
              value={password} onChange={event => setPassword(event.target.value)} required disabled={busy} />
          </div>}
          {error && <div role="alert"><Text as="p" tone="danger">{error}</Text></div>}
          <div className="flex flex-wrap justify-end gap-3">
            <Button type="button" variant="secondary" disabled={busy} onClick={onSignOut}>Sign out</Button>
            <Button type="submit" autoFocus={!needsPassword} loading={busy}>{needsPassword ? 'Sign in and continue' : 'Continue working'}</Button>
          </div>
        </form>
      </Surface>
    </dialog>
  );
}
