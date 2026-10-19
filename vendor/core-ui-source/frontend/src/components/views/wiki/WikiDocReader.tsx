import { PageMeta } from '../../../components/ui';
import { useMemo } from 'react';
import { ChevronRight, Edit2 } from 'lucide-react';
import type { Entry } from '../../../types';
import { formatRelativeTime } from '../../../utils';
import { Button, LINE_ICON_STROKE, MarkdownContent, Pill } from '../../ui';
import { buildBreadcrumbPath } from './buildPageTree';
import { extractMarkdownHeadings } from './extractMarkdownHeadings';
import { getEntryFieldValue, getEntryTitle } from './wikiFieldAccess';

export interface WikiDocReaderProps {
  entry: Entry;
  allEntries: Entry[];
  parentField: string;
  bodyField: string;
  titleField: string;
  onSelectPage: (entry: Entry) => void;
  onEdit?: (entry: Entry) => void;
  isEditor?: boolean;
}

export function WikiDocReader({
  entry,
  allEntries,
  parentField,
  bodyField,
  titleField,
  onSelectPage,
  onEdit,
  isEditor,
}: WikiDocReaderProps) {
  const breadcrumbs = useMemo(
    () => buildBreadcrumbPath(entry.id, allEntries, parentField),
    [entry.id, allEntries, parentField]
  );

  const bodyText = getEntryFieldValue(entry, bodyField);
  const pageTitle = getEntryTitle(entry, titleField);
  const headings = useMemo(() => extractMarkdownHeadings(bodyText), [bodyText]);
  const updatedLabel = entry.updated_at
    ? `Edited ${formatRelativeTime(entry.updated_at)}`
    : entry.created_at
      ? `Created ${formatRelativeTime(entry.created_at)}`
      : null;

  return (
    <div className="flex flex-1 min-w-0 min-h-0">
      <article className="flex-1 min-w-0 overflow-y-auto wiki-doc-scroll">
        <div className="max-w-page mx-auto px-4 md:px-8 py-6 md:py-8">
          {breadcrumbs.length > 1 ? (
            <nav
              aria-label="Breadcrumb"
              className="flex flex-wrap items-center gap-1 text-xs text-[var(--text-subtle)] mb-6"
            >
              {breadcrumbs.map((crumb, i) => {
                const isLast = i === breadcrumbs.length - 1;
                const label = getEntryTitle(crumb, titleField);
                return (
                  <span key={crumb.id} className="inline-flex items-center gap-1 min-w-0">
                    {i > 0 ? (
                      <ChevronRight
                        size={12}
                        strokeWidth={LINE_ICON_STROKE}
                        className="shrink-0 opacity-50"
                        aria-hidden
                      />
                    ) : null}
                    {isLast ? (
                      <span className="truncate text-[var(--text-muted)]">{label}</span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => onSelectPage(crumb)}
                        className="truncate hover:text-[var(--text)] hover:underline underline-offset-2"
                      >
                        {label}
                      </button>
                    )}
                  </span>
                );
              })}
            </nav>
          ) : null}

          <header className="mb-8">
            <div className="flex items-start justify-between gap-4">
              <h1 className="text-2xl font-semibold tracking-tight text-[var(--text)] leading-snug min-w-0">
                {pageTitle}
              </h1>
              {isEditor && onEdit ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => onEdit(entry)}
                  className="shrink-0 inline-flex items-center gap-1.5"
                >
                  <Edit2 size={14} strokeWidth={LINE_ICON_STROKE} />
                  Edit
                </Button>
              ) : null}
            </div>
            <PageMeta>
              {entry.type ? (
                <Pill variant="neutral" tone="descriptive">
                  {entry.type}
                </Pill>
              ) : null}
              {updatedLabel ? <span>{updatedLabel}</span> : null}
            </PageMeta>
          </header>

          <div className="wiki-doc-body">
            {bodyText ? (
              <MarkdownContent mutedBody={false}>{bodyText}</MarkdownContent>
            ) : (
              <div className="rounded-lg border border-dashed border-[var(--panel-border)] px-6 py-12 text-center">
                <p className="text-sm text-[var(--text-muted)] mb-4">
                  This page is empty. Add content to get started.
                </p>
                {isEditor && onEdit ? (
                  <Button type="button" variant="secondary" size="sm" onClick={() => onEdit(entry)}>
                    Write something
                  </Button>
                ) : null}
              </div>
            )}
          </div>
        </div>
      </article>

      {headings.length >= 2 ? (
        <aside
          className="hidden xl:block w-48 shrink-0 overflow-y-auto py-8 pr-3 pl-2 text-[var(--text-subtle)]"
          aria-label="On this page"
        >
          <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-subtle)] mb-3">
            On this page
          </p>
          <ul className="space-y-1.5">
            {headings.map((h, index) => (
              <li key={`${h.id}-${index}`}>
                <button
                  type="button"
                  onClick={() => {
                    const els = document.querySelectorAll(
                      '.wiki-doc-body h1, .wiki-doc-body h2, .wiki-doc-body h3'
                    );
                    const el = els[index];
                    el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                  }}
                  className={`w-full text-left text-xs text-[var(--text-muted)] hover:text-[var(--text)] leading-snug truncate ${
                    h.level === 1 ? 'font-medium' : ''
                  }`}
                  style={{ paddingLeft: (h.level - 1) * 8 }}
                >
                  {h.text}
                </button>
              </li>
            ))}
          </ul>
        </aside>
      ) : null}
    </div>
  );
}
