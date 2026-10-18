import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { AuthPageLayout } from '../components/ui/AuthPageLayout';
import { Button, PageMeta } from '../components/ui';
import { Text } from '../ui';

export function DesktopAccessPage() {
  const { user } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  if (user) return <Navigate to="/" replace />;
  const reopen = async (offline: boolean) => {
    setBusy(true); setError('');
    try {
      if (offline) await window.integralDesktop?.resumeOffline?.();
      else await window.integralDesktop?.signIn?.();
      window.location.replace('/');
    } catch {
      setError('Could not reopen your workspace. Try again. Your local data is unchanged.');
      setBusy(false);
    }
  };
  return (
    <AuthPageLayout compact title="Welcome back" description="Your private local workspace">
      <header className="auth-compact-heading">
        <Text as="h1" variant="heading-lg">Welcome back</Text>
        <Text as="p" variant="body-sm" tone="muted">Your workspace is right where you left it.</Text>
      </header>
      {error && <div role="alert"><Text as="p" variant="body-sm" tone="danger">{error}</Text></div>}
      {window.integralDesktop ? <div className="auth-compact-actions">
        <Button size="lg" loading={busy} disabled={busy} onClick={() => void reopen(false)}>Sign in</Button>
        <Button size="lg" variant="outline" disabled={busy} onClick={() => void reopen(true)}>Continue offline</Button>
      </div> : <PageMeta as="p">Open the Integral desktop app to access this installation.</PageMeta>}
      <Text as="p" variant="meta" tone="muted" className="auth-compact-privacy">Your files and records stay on this computer.</Text>
      <details className="auth-compact-help">
        <summary><Text as="span" variant="meta" tone="muted">About offline access</Text></summary>
        <Text as="p" variant="meta" tone="muted">This computer can reopen its existing workspace without an internet connection. Sign-out does not lock or encrypt local files. Use your computer account to protect this workspace.</Text>
      </details>
    </AuthPageLayout>
  );
}
