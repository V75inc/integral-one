import type { Entry } from '../../../types';
import type { ViewWidgetProps } from '../types';
import type { SortSiblingsConfig } from './buildPageTree';

export function getWikiConfig(view: ViewWidgetProps['view']) {
  const cfg = (view.config || {}) as Record<string, unknown>;
  return {
    parentField: String(cfg.parent_field || '').trim(),
    bodyField: String(cfg.body_field || 'body').trim() || 'body',
    titleField: String(cfg.title_field || 'title').trim() || 'title',
    defaultPageId: String(cfg.default_page_id || '').trim(),
    sortSiblings: cfg.sort_siblings as SortSiblingsConfig | undefined,
  };
}

export function getEntryFieldValue(entry: Entry, field: string): string {
  if (field === 'title') return String(entry.title || '');
  if (field === 'body') return String(entry.body || '');
  if (field.startsWith('custom_fields.')) {
    const key = field.slice('custom_fields.'.length);
    const v = (entry.custom_fields as Record<string, unknown> | undefined)?.[key];
    return v == null ? '' : String(v);
  }
  const e = entry as unknown as Record<string, unknown>;
  const v =
    e[field] ??
    (entry.custom_fields as Record<string, unknown> | undefined)?.[field];
  return v == null ? '' : String(v);
}

export function getEntryTitle(entry: Entry, titleField: string): string {
  return (
    getEntryFieldValue(entry, titleField) ||
    entry.title ||
    'Untitled'
  );
}
