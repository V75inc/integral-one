import { Text } from '../../ui';
import { Link } from 'react-router-dom';

export type AdminEntityType = 'user' | 'workspace' | 'app' | 'track';

export interface AdminOwnerSummary {
  id: string;
  display_name: string;
  email: string;
}

export function adminEntityPath(type: AdminEntityType, id: string): string {
  switch (type) {
    case 'user':
      return `/admin/users/${id}`;
    case 'workspace':
      return `/admin/workspaces/${id}`;
    case 'app':
      return `/admin/apps/${id}`;
    case 'track':
      return `/admin/tracks/${id}`;
  }
}

export function AdminEntityLink({
  type,
  id,
  label,
  className,
  fallback = '—',
}: {
  type: AdminEntityType;
  id?: string | null;
  label?: string | null;
  className?: string;
  fallback?: string;
}) {
  if (!id) {
    return <Text tone="muted" className={className}>{fallback}</Text>;
  }
  const name = label?.trim();
  const text = name && name !== id ? name : `Unnamed ${type}`;
  return (
    <Link
      to={adminEntityPath(type, id)}
      className={className ?? 'font-medium text-[var(--link)] hover:underline'}
    >
      {text}
    </Link>
  );
}

export function AdminOwnerCell({ owner }: { owner?: AdminOwnerSummary | null }) {
  if (!owner?.id) {
    return <Text tone="muted">—</Text>;
  }
  return (
    <div>
      <AdminEntityLink
        type="user"
        id={owner.id}
        label={owner.display_name || owner.email || 'Unnamed user'}
      />
      {owner.email && owner.display_name ? (
        <Text as="p" variant="meta" tone="muted">{owner.email}</Text>
      ) : null}
    </div>
  );
}
