import { useRef, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { Link2, Paperclip } from 'lucide-react';
import { LINE_ICON_STROKE } from '../ui/IconWell';
import { Button } from '../ui/Button';

/**
 * AddToEntryControl — the unified "attach to this entry" affordance.
 *
 * Shape:
 *   ┌────────────────────────────────────────────────────────┐
 *   │  Drop files or links to attach     [📎]  [🔗]          │
 *   └────────────────────────────────────────────────────────┘
 *
 * One visual treatment shared by the entry composer (edit mode) and
 * the read-only entry detail view. Supports drag-and-drop on the
 * whole surface plus dedicated buttons:
 *   - 📎 paperclip → opens the OS file picker
 *   - 🔗 link icon → expands an inline URL form below the row
 *
 * The component is purely presentational — file batches and link
 * additions surface as callbacks (`onFilesAdded`, `onLinkAdded`) so
 * the caller decides what to do with them:
 *   - The composer queues them into a pending list (saved with the
 *     entry on submit).
 *   - The read-only entry view uploads them immediately via the
 *     attachments API.
 *
 * The link form intentionally lives inside this component (state and
 * markup both) so any consumer gets the inline URL editor for free.
 */
interface AddToEntryControlProps {
  /** Called with a non-empty File[] when the user picks files via
   *  drag-and-drop or the file picker. Batches arrive together. */
  onFilesAdded(files: File[]): void;
  /** Called when the user adds a link via the inline form. Omit to
   *  hide the link button entirely. The component validates `http://`
   *  / `https://` prefix before calling. */
  onLinkAdded?(url: string, label: string | undefined): void;
  /** Hide the file paperclip + ignore drops when false. */
  allowFileUpload?: boolean;
  /** Hide the link affordance even if `onLinkAdded` is provided. */
  allowUrlReference?: boolean;
  /** Main row text. Defaults to "Add to this entry". */
  label?: string;
  /** Inline drag-hint shown beside the primary label in a smaller,
   *  quieter type. Hidden when the surface is in `isDragActive`
   *  state (where the primary label takes over with "Drop to attach").
   *  Defaults to "drop files or links to attach". Pass `null` to
   *  suppress entirely. */
  dragHint?: string | null;
  /** Optional small print rendered beneath the main row. */
  hint?: string;
  /** Extra className on the outer container. */
  className?: string;
}

export function AddToEntryControl({
  onFilesAdded,
  onLinkAdded,
  allowFileUpload = true,
  allowUrlReference = true,
  label,
  dragHint,
  hint,
  className,
}: AddToEntryControlProps) {
  const [linkAddOpen, setLinkAddOpen] = useState(false);
  const [pendingUrl, setPendingUrl] = useState('');
  const [pendingUrlLabel, setPendingUrlLabel] = useState('');
  const [urlError, setUrlError] = useState<string | null>(null);
  const urlInputRef = useRef<HTMLInputElement>(null);

  // `noClick` keeps the surface from opening the picker on a generic
  // click; the paperclip button calls `open()` explicitly. `noKeyboard`
  // is necessary too so pressing Space/Enter on the row doesn't fire
  // the picker — only the icon buttons should.
  const { getRootProps, getInputProps, isDragActive, open } = useDropzone({
    onDrop: accepted => {
      if (accepted.length) onFilesAdded(accepted);
    },
    multiple: true,
    noClick: true,
    noKeyboard: true,
    disabled: !allowFileUpload,
  });

  const showLinkButton = allowUrlReference && Boolean(onLinkAdded);

  const submitLink = () => {
    const url = pendingUrl.trim();
    if (!url) {
      setUrlError('Enter a URL');
      return;
    }
    if (!/^https?:\/\//i.test(url)) {
      setUrlError('Must start with http:// or https://');
      return;
    }
    onLinkAdded?.(url, pendingUrlLabel.trim() || undefined);
    setPendingUrl('');
    setPendingUrlLabel('');
    setUrlError(null);
    setLinkAddOpen(false);
  };

  return (
    <div
      {...getRootProps({
        // Surface only takes drop events. Keeping role/tabindex off
        // the outer wrapper keeps the row from competing for focus
        // with the buttons inside.
        role: undefined,
        tabIndex: -1,
      })}
      className={[
        'rounded-lg border overflow-hidden transition-colors duration-fast',
        isDragActive
          ? 'border-[var(--cta-bg)] bg-[var(--cta-bg)]/10'
          : 'border-[var(--panel-border)] bg-[var(--panel-2)]/25',
        className ?? '',
      ].join(' ')}
    >
      {/* Dropzone's hidden file input — required so drag-and-drop and
          react-dropzone's `open()` work consistently. */}
      <input {...getInputProps()} />

      <div className="flex items-center gap-3 px-3 py-2.5 min-h-[2.75rem]">
        {/* Three-column layout:
              [ primary label ]   [ centered drag hint ]   [ icons ]
            The label hugs the left edge, the icons hug the right
            edge, and the muted drag hint sits centered in the
            remaining space. Hidden during `isDragActive` — the
            primary slot then carries the full "Drop to attach"
            confirmation. */}
        <span className="text-sm font-semibold text-[var(--text)] shrink-0">
          {isDragActive ? 'Drop to attach' : label || 'Add to this entry'}
        </span>
        {!isDragActive && dragHint !== null && (
          <span className="flex-1 min-w-0 truncate text-center text-xs text-[var(--text-subtle)]">
            {dragHint ?? 'drop files or links to attach'}
          </span>
        )}
        {(isDragActive || dragHint === null) && (
          // Spacer keeps the icons pinned to the right edge in states
          // where the centered hint slot is absent.
          <span className="flex-1" aria-hidden />
        )}
        <div className="flex items-center gap-0.5 shrink-0">
          {allowFileUpload && (
            <button
              type="button"
              className="p-2 rounded-full text-[var(--brand-accent)] hover:bg-[var(--panel)] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring-color)]"
              aria-label="Attach files"
              onClick={open}
            >
              <Paperclip size={22} strokeWidth={LINE_ICON_STROKE} />
            </button>
          )}
          {showLinkButton && (
            <button
              type="button"
              className={`p-2 rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring-color)] ${
                linkAddOpen
                  ? 'bg-[var(--nav-active-bg)] text-[var(--brand-accent)]'
                  : 'text-[var(--brand-accent)] hover:bg-[var(--panel)]'
              }`}
              aria-label="Add link"
              aria-expanded={linkAddOpen}
              onClick={() => {
                setLinkAddOpen(o => !o);
                setUrlError(null);
                // Defer focus to the next tick so the input is in the
                // DOM before we try to focus it.
                if (!linkAddOpen) {
                  window.setTimeout(() => urlInputRef.current?.focus(), 0);
                }
              }}
            >
              <Link2 size={22} strokeWidth={LINE_ICON_STROKE} />
            </button>
          )}
        </div>
      </div>

      {hint ? (
        <p className="text-xs text-[var(--text-muted)] px-3 pb-2 -mt-1">
          {hint}
        </p>
      ) : null}

      {linkAddOpen && showLinkButton && (
        <div className="px-3 pb-3 pt-1 space-y-2 border-t border-[var(--panel-border)]">
          <input
            ref={urlInputRef}
            type="url"
            value={pendingUrl}
            onChange={e => {
              setPendingUrl(e.target.value);
              if (urlError) setUrlError(null);
            }}
            placeholder="https://…"
            className="w-full rounded-md border border-[var(--panel-border)] bg-[var(--panel)] px-2.5 py-2 text-sm text-[var(--text)] focus:outline-none focus:border-[var(--text-muted)]"
            onKeyDown={e => {
              if (e.key === 'Enter') {
                e.preventDefault();
                submitLink();
              }
            }}
          />
          <input
            type="text"
            value={pendingUrlLabel}
            onChange={e => setPendingUrlLabel(e.target.value)}
            placeholder="Optional label"
            className="w-full rounded-md border border-[var(--panel-border)] bg-[var(--panel)] px-2.5 py-2 text-sm text-[var(--text)] focus:outline-none focus:border-[var(--text-muted)]"
          />
          {urlError ? (
            <p className="text-xs text-[var(--danger-fg)]">{urlError}</p>
          ) : null}
          <div className="flex justify-end gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setLinkAddOpen(false);
                setPendingUrl('');
                setPendingUrlLabel('');
                setUrlError(null);
              }}
            >
              Cancel
            </Button>
            <Button variant="primary" size="sm" onClick={submitLink}>
              Add link
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
