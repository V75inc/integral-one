import { useEffect, useState } from 'react';
import { MarkdownContent } from '../ui';
import { entriesApi } from '../../api';
import type { ViewWidgetProps } from './types';

/**
 * Read-only markdown block region — the reusable Oracle-APEX-style "Static
 * Content" region. Reuses the existing ``MarkdownContent`` renderer
 * (``EntryDetail.tsx``'s entry-body renderer) rather than shipping any new
 * markdown-rendering code.
 *
 * Config: ``{body?: string}`` (inline markdown, no entry fetch needed at
 * all) or ``{body_field?: string}`` (read markdown from that field key on
 * the bound entry, resolved via ``view.config.__bindings.entryId`` the same
 * way ``FormRegionWidget``'s self-bind mode does).
 */
export function StaticContentWidget({ view }: ViewWidgetProps) {
  const config = (view.config || {}) as Record<string, unknown>;
  const bindings = (config.__bindings || {}) as Record<string, unknown>;
  const inlineBody = typeof config.body === 'string' ? config.body : undefined;
  const bodyField = typeof config.body_field === 'string' ? config.body_field : undefined;
  const entryId = typeof bindings.entryId === 'string' ? bindings.entryId : undefined;

  const [fetchedBody, setFetchedBody] = useState<string | null>(null);

  useEffect(() => {
    if (inlineBody != null || !bodyField || !entryId) return;
    let cancelled = false;
    entriesApi
      .get(entryId)
      .then(entry => {
        if (cancelled) return;
        const v = (entry.custom_fields || {})[bodyField];
        setFetchedBody(v == null ? '' : String(v));
      })
      .catch(() => {
        if (!cancelled) setFetchedBody('');
      });
    return () => {
      cancelled = true;
    };
  }, [inlineBody, bodyField, entryId]);

  const body = inlineBody ?? fetchedBody ?? '';
  if (!body) return null;

  return (
    <div data-testid="static-content-widget">
      <MarkdownContent>{body}</MarkdownContent>
    </div>
  );
}
