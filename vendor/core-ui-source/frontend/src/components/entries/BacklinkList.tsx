import { ArrowUpRight } from 'lucide-react';
import { Link } from 'react-router-dom';

import { LINE_ICON_STROKE } from '../ui';

export interface BacklinkRef {
  id: string;
  title?: string | null;
  track_id: string;
  track_title?: string | null;
}

/** More than this many backlinks start collapsed behind their heading. */
export const BACKLINKS_OPEN_LIMIT = 5;

/**
 * The "Referenced by" style list on a record. A long list (a pay run's
 * payslips, an employee's filings) would push the record's own fields off the
 * screen, so it stays closed until asked for.
 */
export function BacklinkList({
  refs,
  label,
  total,
}: {
  refs: BacklinkRef[];
  label: string;
  total?: number;
}) {
  const count = total ?? refs.length;
  const heading = (
    <span className="inline-flex items-center gap-1.5 text-[var(--text-subtle)]">
      <ArrowUpRight size={12} strokeWidth={LINE_ICON_STROKE} aria-hidden />
      <span>
        {label} ({count}
        {count > refs.length ? `; showing ${refs.length}` : ''})
      </span>
    </span>
  );
  const list = (
    <ul className="ml-[18px] flex flex-wrap gap-x-3 gap-y-1">
      {refs.map(ref => (
        <li key={ref.id} className="inline-flex items-center gap-1">
          <Link
            to={`/tracks/${ref.track_id}?entry=${encodeURIComponent(ref.id)}`}
            className="text-[var(--link)] hover:underline"
            onClick={e => e.stopPropagation()}
          >
            {ref.title || 'Untitled'}
          </Link>
          {ref.track_title ? (
            <span className="text-[var(--text-subtle)]">
              · {ref.track_title}
            </span>
          ) : null}
        </li>
      ))}
    </ul>
  );
  if (refs.length > BACKLINKS_OPEN_LIMIT) {
    return (
      <details className="space-y-1" data-testid="backlinks-collapsed">
        <summary className="cursor-pointer list-none">{heading}</summary>
        <div className="mt-1">{list}</div>
      </details>
    );
  }
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-1.5">{heading}</div>
      {list}
    </div>
  );
}
