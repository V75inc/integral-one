/**
 * ProvenanceBadge — UX-01 entry provenance surface.
 *
 * Pure-render badge keyed by ``entry.provenance.source`` ∈
 * {'human', 'agent', 'connector', 'system'}. Click opens a small popover
 * showing the parsed provenance detail (synced_at as relative time, source_id
 * where present, and confidence when not 1.0).
 *
 * I-UX-01 (docs/INVARIANTS.md): this component is the SOLE consumer of
 * ``Entry.provenance.source`` in the frontend. Surfaces that need provenance
 * must mount ``<ProvenanceBadge entry={entry} />`` — they MUST NOT inline a
 * different render path. This keeps the visual semantics consistent across
 * feed cards, entry detail headers, and any future provenance-aware UI.
 */
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import type { ActorKind, Entry, Provenance } from '../../types';
import { auditLogSettingsHref } from '../../api/auditLog';

/** Per-source visual variant. 'human' is intentionally subtle (low chrome) so
 *  the feed reads quietly; non-human sources adopt a distinct accent so the
 *  user can spot AI/connector writes at a glance. */
interface Variant {
  bg: string;
  fg: string;
  border: string;
  icon: string;
  label: string;
}

// Variants keyed to Integral semantic tokens (var(--*)) so the chip
// inherits the canvas-aware palette in both light and dark themes.
// Human is intentionally low-chrome (subtle, transparent fill); non-
// human variants pick semantic tokens that already exist in the design
// system — agent maps to --ai-* (violet hue with light/dark variants),
// connector to --info-* (cool blue), system to --warn-* (warm amber).
const VARIANT_STYLES: Record<ActorKind, Variant> = {
  human: {
    bg: 'bg-transparent',
    fg: 'text-[var(--text-subtle)]',
    border: 'border-transparent',
    icon: '·',
    label: 'human',
  },
  agent: {
    bg: 'bg-[var(--ai-bg)]',
    fg: 'text-[var(--ai-fg)]',
    border: 'border-[color:var(--ai-fg)]/30',
    icon: '✻',
    label: 'agent',
  },
  connector: {
    bg: 'bg-[var(--info-bg)]',
    fg: 'text-[var(--info-fg)]',
    border: 'border-[color:var(--info-fg)]/30',
    icon: '⇄',
    label: 'connector',
  },
  system: {
    bg: 'bg-[var(--warn-bg)]',
    fg: 'text-[var(--warn-fg)]',
    border: 'border-[color:var(--warn-fg)]/30',
    icon: '⚙',
    label: 'system',
  },
};

/** Light-weight relative-time formatter. Avoids pulling in date-fns just for
 *  this badge — the existing utils helpers are tied to entry timestamps and
 *  don't accept arbitrary ISO inputs. */
function relativeTime(iso?: string): string {
  if (!iso) return '';
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return iso;
  const diffMs = Date.now() - t;
  if (diffMs < 0) return 'just now';
  const sec = Math.floor(diffMs / 1000);
  if (sec < 45) return 'just now';
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} minute${min === 1 ? '' : 's'} ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} hour${hr === 1 ? '' : 's'} ago`;
  const day = Math.floor(hr / 24);
  if (day < 30) return `${day} day${day === 1 ? '' : 's'} ago`;
  const mo = Math.floor(day / 30);
  if (mo < 12) return `${mo} month${mo === 1 ? '' : 's'} ago`;
  const yr = Math.floor(mo / 12);
  return `${yr} year${yr === 1 ? '' : 's'} ago`;
}

/** Parse ``<connector_id>:<external_id>`` into its parts. Returns null when
 *  the source_id isn't in connector-form (e.g. agent/user UUIDs). */
function parseConnectorSourceId(
  sourceId: string | undefined,
): { connectorId: string; externalId: string } | null {
  if (!sourceId) return null;
  // Find FIRST colon — external ids may legitimately contain colons.
  const idx = sourceId.indexOf(':');
  if (idx <= 0 || idx === sourceId.length - 1) return null;
  return {
    connectorId: sourceId.slice(0, idx),
    externalId: sourceId.slice(idx + 1),
  };
}

interface ProvenanceBadgeProps {
  entry: Pick<Entry, 'id' | 'provenance'>;
  /** Optional className appended to the wrapper (callers can adjust margins). */
  className?: string;
}

export function ProvenanceBadge({ entry, className = '' }: ProvenanceBadgeProps) {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLSpanElement>(null);

  // Default to 'human' when provenance is missing — legacy entries are lazy-
  // backfilled on first read by the backend, but tests/mocks may omit it.
  const provenance: Provenance = entry.provenance ?? { source: 'human' };
  const source: ActorKind = (
    ['human', 'agent', 'connector', 'system'].includes(provenance.source)
      ? provenance.source
      : 'human'
  ) as ActorKind;
  // Close popover on outside click or Escape — same idiom EntryCard uses for
  // the owner menu so the chrome stays consistent.
  //
  // Declared BEFORE the `source === 'human'` early return below: a hook after
  // a conditional return changes the hook count between renders, and React
  // throws "rendered fewer hooks than expected" the first time an entry's
  // provenance flips from non-human to human on a mounted badge. The effect
  // is inert while closed, so hoisting it costs nothing.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      const t = e.target as Node | null;
      if (!t || !wrapperRef.current?.contains(t)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  // Human is the default — render nothing. Surfacing "· human" on every
  // entry exposed an internal vocabulary tag with no information value to
  // the reader (B-ENT-07). Non-human provenance still renders the chip so
  // agent/connector/system writes remain visible at a glance.
  if (source === 'human') return null;
  const variant = VARIANT_STYLES[source];
  const connectorParts =
    source === 'connector' ? parseConnectorSourceId(provenance.source_id) : null;

  return (
    <span ref={wrapperRef} className={`relative inline-flex ${className}`}>
      <button
        type="button"
        data-testid={`provenance-badge-${source}`}
        onClick={e => {
          e.stopPropagation();
          setOpen(o => !o);
        }}
        aria-label={`Provenance: ${variant.label}`}
        aria-expanded={open}
        aria-haspopup="dialog"
        title={`Provenance: ${variant.label}`}
        className={[
          'inline-flex items-center gap-1 rounded-[var(--radius-pill)]',
          'border px-1.5 py-0.5 text-[11px] leading-none',
          'transition-colors duration-fast',
          'outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring-color)]',
          variant.bg,
          variant.fg,
          variant.border,
        ].join(' ')}
      >
        <span aria-hidden className="font-medium">
          {variant.icon}
        </span>
        <span className="font-medium">{variant.label}</span>
      </button>
      {open ? (
        <div
          role="dialog"
          aria-label="Provenance detail"
          /* Right-anchored so the popover grows leftward from the
             badge's right edge — this badge usually sits in the
             top-right corner of a card / modal title bar, and a
             left-anchored popover gets clipped by the parent's
             ``overflow-hidden`` (EntryDetail modal does this for
             rounded-corner clipping). */
          className="
            absolute z-20 top-full mt-1 right-0
            min-w-[220px] max-w-[280px]
            bg-[var(--panel)] border border-[var(--panel-border)]
            rounded-[var(--radius-card)] shadow-[var(--shadow-pop)]
            px-3 py-2 text-xs text-[var(--text)]
            animate-fade-in
          "
          onClick={e => e.stopPropagation()}
        >
          <div className="flex items-center gap-1.5 mb-1.5">
            <span
              aria-hidden
              className={`inline-flex items-center justify-center w-4 h-4 rounded-[var(--radius-pill)] ${variant.bg} ${variant.fg}`}
            >
              {variant.icon}
            </span>
            <span className="font-medium capitalize">{variant.label}</span>
          </div>
          {provenance.synced_at ? (
            <div className="text-[var(--text-muted)]">
              <span className="text-[var(--text-subtle)]">When </span>
              {relativeTime(provenance.synced_at)}
            </div>
          ) : null}
          {connectorParts ? (
            <div className="text-[var(--text-muted)] mt-1">
              <div>
                <span className="text-[var(--text-subtle)]">Connector </span>
                <span className="font-mono">{connectorParts.connectorId}</span>
              </div>
              <div>
                <span className="text-[var(--text-subtle)]">External </span>
                <span className="font-mono truncate inline-block max-w-[200px] align-bottom">
                  {connectorParts.externalId}
                </span>
              </div>
            </div>
          ) : provenance.source_id ? (
            <div className="text-[var(--text-muted)] mt-1">
              <span className="text-[var(--text-subtle)]">Ref </span>
              <span className="font-mono truncate inline-block max-w-[200px] align-bottom">
                {provenance.source_id}
              </span>
            </div>
          ) : null}
          {typeof provenance.confidence === 'number' && provenance.confidence < 1 ? (
            <div className="text-[var(--text-muted)] mt-1">
              <span className="text-[var(--text-subtle)]">Confidence </span>
              {(provenance.confidence * 100).toFixed(0)}%
            </div>
          ) : null}
          {provenance.derived_from && provenance.derived_from.length > 0 ? (
            <div className="text-[var(--text-muted)] mt-1">
              <span className="text-[var(--text-subtle)]">Derived from </span>
              <span className="font-mono">
                {provenance.derived_from.length}{' '}
                {provenance.derived_from.length === 1 ? 'source' : 'sources'}
              </span>
            </div>
          ) : null}
          <div className="mt-2 pt-2 border-t border-[var(--panel-border)]">
            <Link
              to={auditLogSettingsHref({
                resource_id: entry.id,
                resource_type: 'Entry',
                actor_kind: source,
              })}
              className="text-[var(--info-fg)] hover:underline"
              onClick={e => e.stopPropagation()}
            >
              View in Audit log
            </Link>
          </div>
        </div>
      ) : null}
    </span>
  );
}
