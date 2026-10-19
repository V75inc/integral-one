import { Fragment, useMemo, useState, useRef, useEffect } from 'react';
import { X } from 'lucide-react';
import type { Tag } from '../../types';
import { LINE_ICON_STROKE } from '../ui';
import { formatTagGroupLabel } from '../../utils/tagProfile';

interface TagLookupControlProps {
  /** Tags allowed for the current entry type (operational model ``applies_to`` + ordering). */
  selectableTags: Tag[];
  /** Resolve chip labels for selections (usually full track tag list). Defaults to ``selectableTags``. */
  labelSource?: Tag[];
  selectedIds: string[];
  onChangeSelected(ids: string[]): void;
  /** Grow on the row next to type/track selectors (e.g. `flex-1 min-w-[10rem]`). */
  className?: string;
}

export function TagLookupControl({
  selectableTags,
  labelSource,
  selectedIds,
  onChangeSelected,
  className = '',
}: TagLookupControlProps) {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const resolveSource = labelSource ?? selectableTags;

  const selected = useMemo(
    () =>
      selectedIds
        .map(id => resolveSource.find(t => t.id === id))
        .filter((t): t is Tag => Boolean(t)),
    [resolveSource, selectedIds]
  );

  const qn = q.trim().toLowerCase();
  const candidates = useMemo(() => {
    const sel = new Set(selectedIds);
    return selectableTags
      .filter(t => {
        if (sel.has(t.id)) return false;
        if (!qn) return true;
        return t.name.toLowerCase().includes(qn);
      })
      .slice(0, 50);
  }, [selectableTags, selectedIds, qn]);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  const add = (id: string) => {
    if (selectedIds.includes(id)) return;
    onChangeSelected([...selectedIds, id]);
    setQ('');
    setOpen(false);
    inputRef.current?.focus();
  };

  const remove = (id: string) => {
    onChangeSelected(selectedIds.filter(x => x !== id));
  };

  if (!selectableTags.length) return null;

  return (
    <div ref={wrapRef} className={`relative min-w-0 ${className}`.trim()}>
      <div
        className="flex min-w-0 flex-wrap items-center gap-2 rounded-md border border-[var(--panel-border)] bg-[var(--panel-2)] px-3 py-1.5 pr-2 text-left text-sm text-[var(--text)] outline-none transition focus-within:ring-2 focus-within:ring-[var(--focus-ring-color)]"
        onMouseDown={e => {
          if (e.target === inputRef.current) return;
          if ((e.target as HTMLElement).closest('button')) return;
          inputRef.current?.focus();
        }}
      >
        <div
          role="list"
          aria-label="Selected tags"
          className="flex flex-wrap items-center gap-1.5"
        >
          {selected.map(t => (
            <span
              key={t.id}
              role="listitem"
              className="inline-flex h-4 max-w-full items-center gap-0.5 rounded border border-[var(--panel-border)] bg-[var(--panel)] pl-1 pr-0.5 text-[var(--text)] leading-none"
            >
              {t.color ? (
                <span
                  className="h-1.5 w-1.5 shrink-0 rounded-full"
                  style={{ background: t.color }}
                  aria-hidden
                />
              ) : null}
              <span className="max-w-[9rem] truncate text-sm leading-none">{t.name}</span>
              <button
                type="button"
                className="flex h-4 w-4 shrink-0 items-center justify-center rounded text-[var(--text-muted)] hover:bg-[var(--panel-2)] hover:text-[var(--text)]"
                aria-label={`Remove ${t.name}`}
                onClick={e => {
                  e.stopPropagation();
                  remove(t.id);
                }}
              >
                <X size={11} strokeWidth={LINE_ICON_STROKE} />
              </button>
            </span>
          ))}
        </div>
        <input
          ref={inputRef}
          value={q}
          onChange={e => {
            setQ(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          placeholder="Add tags..."
          className="min-h-0 min-w-[4.5rem] flex-1 border-none bg-transparent p-0 text-sm font-normal leading-normal text-[var(--text)] placeholder:text-[var(--text-muted)] outline-none"
          aria-label="Add tags"
          aria-expanded={open}
          aria-controls="tag-lookup-results"
        />
      </div>
      {open && (
        <div
          id="tag-lookup-results"
          className="absolute left-0 right-0 z-20 mt-0.5 max-h-48 overflow-auto rounded-md border border-[var(--panel-border)] bg-[var(--panel)] py-1 shadow-lg"
          role="listbox"
        >
          {candidates.length === 0 ? (
            <p className="px-2.5 py-2 text-xs text-[var(--text-muted)]">
              {qn ? 'No matching tags.' : 'All tags selected.'}
            </p>
          ) : (
            candidates.map((t, i) => {
              const prev = i > 0 ? candidates[i - 1] : null;
              const g = t.group_key?.trim() || '';
              const prevG = prev?.group_key?.trim() || '';
              const showHeader = Boolean(g) && (i === 0 || g !== prevG);
              return (
                <Fragment key={t.id}>
                  {showHeader ? (
                    <div
                      className="px-2.5 pt-1.5 pb-0.5 text-[12px] font-semibold uppercase tracking-wide text-[var(--text-muted)]"
                      role="presentation"
                    >
                      {formatTagGroupLabel(g)}
                    </div>
                  ) : null}
                  <button
                    type="button"
                    role="option"
                    className="w-full truncate px-2.5 py-1.5 text-left text-sm text-[var(--text)] hover:bg-[var(--panel-2)]"
                    onMouseDown={e => e.preventDefault()}
                    onClick={() => add(t.id)}
                  >
                    {t.name}
                  </button>
                </Fragment>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
