import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { isPlatformAdmin } from '../../hooks/usePlatformAdmin';

export function RequirePlatformAdmin({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div
        role="status"
        aria-label="Loading"
        className="min-h-screen flex items-center justify-center bg-[var(--bg)]"
      />
    );
  }

  if (!user || !isPlatformAdmin(user)) {
    return <Navigate to="/" state={{ from: location }} replace />;
  }

  return <>{children}</>;
}
