interface WorkspaceCreationRightsNoticeProps {
  resource: 'apps' | 'tracks';
  show: boolean;
  className?: string;
}

/** Inline note when the caller lacks workspace-level creation rights. */
export function WorkspaceCreationRightsNotice({
  resource,
  show,
  className = '',
}: WorkspaceCreationRightsNoticeProps) {
  if (!show) return null;
  const label = resource === 'apps' ? 'apps' : 'tracks';
  return (
    <p
      className={`text-sm text-[var(--text-muted)] ${className}`.trim()}
      role="status"
    >
      Your workspace role doesn&apos;t include permission to create {label}. Ask an
      admin to enable it.
    </p>
  );
}
