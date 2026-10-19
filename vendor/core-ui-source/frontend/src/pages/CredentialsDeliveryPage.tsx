import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { authApi } from '../api/auth';
import { Button } from '../components/ui';
import { Text } from '../ui';
import {
  AUTH_FIELD_INPUT_CLASSES,
  AUTH_FIELD_LABEL_CLASSES,
  AuthPageLayout,
  AuthPanelHeading,
} from '../components/ui/AuthPageLayout';

/** Confirm mailbox possession; the existing reset page owns password creation. */
export function CredentialsDeliveryPage() {
  const [params] = useSearchParams();
  const member = params.get('member') || '';
  const intent = params.get('intent') || '';
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [message, setMessage] = useState('');

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (busy || !member || !intent || !/^\d{6}$/.test(code)) return;
    setBusy(true);
    try {
      const { data } = await authApi.verifyCredentialsDelivery(member, intent, code);
      setDone(data.credentials_emailed);
      setMessage(data.credentials_emailed
        ? 'Check your email for a password-setup link. Your password has not been changed.'
        : 'Delivery is pending. Retry with the same code in a moment.');
    } catch {
      setMessage('Unable to confirm delivery. Check the code and try again. If it has expired, contact your workspace administrator.');
    } finally {
      setBusy(false);
    }
  }

  async function resend() {
    if (busy) return;
    setBusy(true);
    try {
      const { data } = await authApi.resendCredentialsDelivery(member, intent);
      setMessage(data.challenge_emailed
        ? 'A confirmation code has been sent. Check your email.'
        : 'A code could not be sent yet. Wait at least 30 seconds and try again, or contact your workspace administrator.');
    } catch {
      setMessage('Unable to resend the code. Please try again later.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthPageLayout title="Confirm your email" description="Set up secure access to your workspace.">
      <AuthPanelHeading>Confirm delivery</AuthPanelHeading>
      {!member || !intent ? (
        <Text as="p">This confirmation link is incomplete. Contact your workspace administrator.</Text>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          {!done && <>
            <label htmlFor="delivery-code" className={AUTH_FIELD_LABEL_CLASSES}>Confirmation code</label>
            <input id="delivery-code" className={AUTH_FIELD_INPUT_CLASSES}
              inputMode="numeric" autoComplete="one-time-code" maxLength={6}
              value={code} onChange={e => setCode(e.target.value)} disabled={busy} />
            <Button type="submit" variant="primary" disabled={busy || !/^\d{6}$/.test(code)}>
              {busy ? 'Please wait…' : 'Confirm and send setup link'}
            </Button>
            <Button type="button" variant="secondary" onClick={() => void resend()} disabled={busy}>Resend code</Button>
          </>}
          {message && <div role="status"><Text as="p">{message}</Text></div>}
        </form>
      )}
      <Link to="/login">Back to sign in</Link>
    </AuthPageLayout>
  );
}
