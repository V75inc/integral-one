import { Package } from 'lucide-react';
import { LINE_ICON_STROKE } from '../../ui';

interface LibraryDivergenceBannerProps {
  libraryName?: string;
  onDetach: () => void;
  onRevert: () => void;
  disabled?: boolean;
}

export function LibraryDivergenceBanner({
  libraryName,
  onDetach,
  onRevert,
  disabled,
}: LibraryDivergenceBannerProps) {
  return (
    <div className="app-card p-4 border-l-4 border-l-[var(--link)]">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <Package size={16} strokeWidth={LINE_ICON_STROKE} className="text-[var(--link)] shrink-0" />
          <div className="min-w-0">
            <p className="text-xs font-medium text-[var(--text)]">
              Customized from library: <span className="text-[var(--link)]">{libraryName ?? 'Library profile'}</span>
            </p>
            <p className="text-[12px] text-[var(--text-muted)] mt-0.5">
              Edits apply to this track only and do not affect the library package.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            className="inline-flex items-center gap-1 text-[12px] px-2 py-1 rounded border border-[var(--panel-border)] text-[var(--text-muted)] hover:text-[var(--text)] hover:border-[var(--text-muted)] transition-colors"
            onClick={onDetach}
            disabled={disabled}
          >
            Detach
          </button>
          <button
            type="button"
            className="inline-flex items-center gap-1 text-[12px] px-2 py-1 rounded border border-[var(--panel-border)] text-[var(--text-muted)] hover:text-[var(--text)] hover:border-[var(--text-muted)] transition-colors"
            onClick={onRevert}
            disabled={disabled}
          >
            Revert to library
          </button>
        </div>
      </div>
    </div>
  );
}
