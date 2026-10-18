import { Navigate } from 'react-router-dom';
import { AuthPageLayout } from '../components/ui/AuthPageLayout';
import { PageMeta } from '../components/ui';
import { useAuth } from '../context/AuthContext';

/** Neutral fallback; the configured host supplies its account experience. */
export function HostAccessPage() {
  const { user } = useAuth();
  if (user) return <Navigate to="/" replace />;
  return (
    <AuthPageLayout compact title="Open your workspace" description="Host authentication">
      <PageMeta as="p">Open the client configured for this installation to sign in.</PageMeta>
    </AuthPageLayout>
  );
}
