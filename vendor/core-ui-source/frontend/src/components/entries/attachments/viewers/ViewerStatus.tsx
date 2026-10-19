import { AlertTriangle, Loader2 } from 'lucide-react';
import { LINE_ICON_STROKE } from '../../../ui/IconWell';

/**
 * Shared loading / error state for the viewer components.
 *
 * Each viewer drops this in while the underlying blob loads (or when
 * conversion fails) so the user sees a consistent presentation
 * regardless of file type.
 */
export function ViewerStatus({
  state,
  message,
}: {
  state: 'loading' | 'error';
  message?: string | null;
}) {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-sm text-[var(--text-muted)]">
      {state === 'loading' ? (
        <>
          <Loader2
            size={20}
            strokeWidth={LINE_ICON_STROKE}
            className="animate-spin"
          />
          <span>Loading…</span>
        </>
      ) : (
        <>
          <AlertTriangle
            size={20}
            strokeWidth={LINE_ICON_STROKE}
            className="text-[var(--danger-fg)]"
          />
          <span className="text-[var(--text)]">
            {message || 'Failed to load attachment'}
          </span>
        </>
      )}
    </div>
  );
}
