import { Navigate, useParams } from 'react-router-dom';

/** Keep old catalog bookmarks useful without retaining a second catalog UI. */
export function AppCatalogRedirect() {
  const { id } = useParams<{ id: string }>();
  return <Navigate replace to={`/apps?manage=1${id ? `&package=${encodeURIComponent(id)}` : ''}`} />;
}
