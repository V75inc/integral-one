import { useEffect, useMemo, useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { buildPageTree, type WikiTreeNode } from './wiki/buildPageTree';
import { entriesApi, tracksApi } from '../../api';
import { slug } from '../entries/entryFormCustomFields';
import type { ViewWidgetProps } from './types';
import type { Entry } from '../../types';
import { IconButton, Surface, Text } from '../../ui';

/**
 * Hierarchical tree region over a track's entries via a self-relational
 * parent field — the reusable Oracle-APEX-style "Tree" region (e.g. an HR
 * org chart via ``employee.manager``). Reuses ``buildPageTree`` /
 * ``resolveParentEntryId`` from the wiki widget's tree-build utility
 * verbatim (that module has no wiki-specific coupling — flat ``Entry[]`` +
 * a parent-field path in, ``{roots, byId}`` out, with cycle-skip and
 * sibling-sort already implemented and already unit-tested) rather than
 * reimplementing tree layout.
 *
 * Config: ``{source_track?, parent_field, label_field?, sort_siblings?}``.
 * When ``source_track`` is omitted, uses the entries already delivered to
 * this widget by ``ComposableViewSlot`` for its own placement (the common
 * case — tree_region placed as a track's own view). When set, resolves the
 * named track (by id, or by template/title slug match) and fetches its
 * entries directly instead, for the "show a hierarchy sourced from a
 * different track" case.
 */
export function TreeRegionWidget({ view, entries, isLoading, onEntryOpen }: ViewWidgetProps) {
  const config = (view.config || {}) as Record<string, unknown>;
  const sourceTrack = typeof config.source_track === 'string' ? config.source_track : undefined;
  const parentField =
    typeof config.parent_field === 'string' ? config.parent_field : 'custom_fields.parent';
  const labelField = typeof config.label_field === 'string' ? config.label_field : 'title';
  const sortSiblings = config.sort_siblings as
    | { field?: string; direction?: 'asc' | 'desc' }
    | undefined;

  const [fetchedEntries, setFetchedEntries] = useState<Entry[] | null>(null);
  const [loadingSource, setLoadingSource] = useState(Boolean(sourceTrack));

  useEffect(() => {
    if (!sourceTrack) {
      setFetchedEntries(null);
      return;
    }
    let cancelled = false;
    setLoadingSource(true);
    (async () => {
      try {
        const allTracks = await tracksApi.list();
        const track =
          allTracks.find(t => t.id === sourceTrack) ||
          allTracks.find(t => slug(String(t.template_id || t.relation_type_key || t.title)) === slug(sourceTrack));
        if (!track) {
          if (!cancelled) setFetchedEntries([]);
          return;
        }
        const es = await entriesApi.list({ track_id: track.id, limit: 200 });
        if (!cancelled) setFetchedEntries(es);
      } catch {
        if (!cancelled) setFetchedEntries([]);
      } finally {
        if (!cancelled) setLoadingSource(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sourceTrack]);

  const sourceEntries = sourceTrack ? fetchedEntries ?? [] : entries;

  const tree = useMemo(
    () => buildPageTree(sourceEntries, parentField, sortSiblings),
    [sourceEntries, parentField, sortSiblings]
  );

  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const getLabel = (entry: Entry): string => {
    if (labelField === 'title') return entry.title || `Entry ${entry.id.slice(-6)}`;
    const v = (entry.custom_fields || {})[labelField];
    return v == null || v === '' ? entry.title || `Entry ${entry.id.slice(-6)}` : String(v);
  };

  const renderNode = (node: WikiTreeNode, depth: number) => {
    const isCollapsed = collapsed.has(node.entry.id);
    const hasChildren = node.children.length > 0;
    return (
      <div key={node.entry.id}>
        <Surface tone="transparent" border="none" radius="input" hoverTone="panel-2"
          className="flex items-center gap-1.5 py-1.5 px-2 cursor-pointer"
          style={{ paddingLeft: `${depth * 20 + 8}px` }}
          onClick={() => onEntryOpen(node.entry)}
        >
          {hasChildren ? (
            <IconButton
              type="button"
              label={isCollapsed ? 'Expand' : 'Collapse'}
              onClick={e => {
                e.stopPropagation();
                setCollapsed(prev => {
                  const next = new Set(prev);
                  if (next.has(node.entry.id)) next.delete(node.entry.id);
                  else next.add(node.entry.id);
                  return next;
                });
              }}
            >
              <ChevronRight
                size={14}
                strokeWidth={1.5}
                className={`transition-transform ${isCollapsed ? '' : 'rotate-90'}`}
              />
            </IconButton>
          ) : (
            <span className="w-3.5" />
          )}
          <Text as="span" variant="body">{getLabel(node.entry)}</Text>
        </Surface>
        {hasChildren && !isCollapsed && (
          <div>{node.children.map(child => renderNode(child, depth + 1))}</div>
        )}
      </div>
    );
  };

  if (isLoading || loadingSource) {
    return (
      <Surface tone="panel-2" border="none" radius="input" className="h-24 animate-pulse" />
    );
  }

  if (!tree.roots.length) {
    return (
      <Text as="div" variant="body" tone="muted" className="p-6 text-center">No entries yet.</Text>
    );
  }

  return (
    <Surface tone="panel" border="default" radius="input" padding="sm"
      data-testid="tree-region-widget"
    >
      {tree.roots.map(node => renderNode(node, 0))}
    </Surface>
  );
}
