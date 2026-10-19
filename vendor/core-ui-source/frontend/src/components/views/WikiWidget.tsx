import { useCallback, useEffect, useMemo, useState } from 'react';
import { BookOpen, PanelLeft } from 'lucide-react';
import type { ViewWidgetProps } from './types';
import type { Entry } from '../../types';
import { useToast } from '../../context/ToastContext';
import {
  EmptyState,
  IconWell,
  LINE_ICON_STROKE,
  Skeleton,
} from '../ui';
import {
  buildPageTree,
  resolveParentEntryId,
  type WikiTreeNode,
} from './wiki/buildPageTree';
import { WikiPageWorkspace } from './wiki/WikiPageWorkspace';
import { WikiPageSidebar } from './wiki/WikiPageSidebar';
import { getWikiConfig } from './wiki/wikiFieldAccess';
import {
  isWikiCapableEntryType,
  resolveWikiPageEntryTypeForTrack,
} from './wiki/resolveWikiPageEntryType';

function collectExpandableIds(nodes: WikiTreeNode[]): string[] {
  const ids: string[] = [];
  const walk = (list: WikiTreeNode[]) => {
    for (const n of list) {
      if (n.children.length) {
        ids.push(n.entry.id);
        walk(n.children);
      }
    }
  };
  walk(nodes);
  return ids;
}

function WikiWidgetInner({
  entries,
  view,
  isLoading,
  onEntryUpdate,
  onEntryDelete,
  onEntryCreate,
  emptyState,
  isEditor,
  publicPermissions,
  publicToken,
}: ViewWidgetProps) {
  const { showToast } = useToast();
  const { parentField, bodyField, titleField, defaultPageId, sortSiblings } =
    getWikiConfig(view);

  const wikiEntries = useMemo(() => {
    const keys = view.entry_type_keys;
    if (!keys?.length) return entries;
    return entries.filter(e => isWikiCapableEntryType(e.type || '', keys));
  }, [entries, view.entry_type_keys]);

  const tree = useMemo(() => {
    if (!parentField) return { roots: [], byId: new Map() };
    return buildPageTree(wikiEntries, parentField, sortSiblings);
  }, [wikiEntries, parentField, sortSiblings]);

  const storageKey = `wiki-expanded:${view.id}`;
  const sidebarKey = `wiki-sidebar:${view.id}`;

  const [selectedId, setSelectedId] = useState<string | null>(null);
  /** Entry just created — kept until the entries query includes it. */
  const [pendingEntry, setPendingEntry] = useState<Entry | null>(null);
  const [openNewPageInEdit, setOpenNewPageInEdit] = useState(false);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => new Set());
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const trackId = entries[0]?.track_id || view.track_id;

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(storageKey);
      if (raw) {
        const parsed = JSON.parse(raw) as string[];
        if (Array.isArray(parsed)) setExpandedIds(new Set(parsed));
      }
      const side = sessionStorage.getItem(sidebarKey);
      if (side === '0') setSidebarOpen(false);
    } catch {
      /* ignore */
    }
  }, [storageKey, sidebarKey]);

  const persistExpanded = useCallback(
    (next: Set<string>) => {
      setExpandedIds(next);
      try {
        sessionStorage.setItem(storageKey, JSON.stringify([...next]));
      } catch {
        /* ignore */
      }
    },
    [storageKey]
  );

  const setSidebarOpenPersisted = useCallback(
    (open: boolean) => {
      setSidebarOpen(open);
      try {
        sessionStorage.setItem(sidebarKey, open ? '1' : '0');
      } catch {
        /* ignore */
      }
    },
    [sidebarKey]
  );

  useEffect(() => {
    if (pendingEntry && tree.byId.has(pendingEntry.id)) {
      setPendingEntry(null);
    }
  }, [pendingEntry, tree.byId]);

  useEffect(() => {
    if (!wikiEntries.length && !pendingEntry) {
      setSelectedId(null);
      return;
    }
    if (
      selectedId &&
      (tree.byId.has(selectedId) || pendingEntry?.id === selectedId)
    ) {
      return;
    }
    if (defaultPageId && tree.byId.has(defaultPageId)) {
      setSelectedId(defaultPageId);
      return;
    }
    const firstRoot = tree.roots[0];
    if (firstRoot) setSelectedId(firstRoot.entry.id);
  }, [wikiEntries, tree, defaultPageId, selectedId, pendingEntry]);

  useEffect(() => {
    if (expandedIds.size > 0 || !tree.roots.length) return;
    persistExpanded(new Set(collectExpandableIds(tree.roots)));
  }, [tree.roots, expandedIds.size, persistExpanded]);

  const selectedEntry = selectedId
    ? tree.byId.get(selectedId)?.entry ||
      (pendingEntry?.id === selectedId ? pendingEntry : null)
    : null;

  const handleToggle = (id: string) => {
    const next = new Set(expandedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    persistExpanded(next);
  };

  const handleSelect = (entry: Entry) => {
    setOpenNewPageInEdit(false);
    setSelectedId(entry.id);
    const parentId = resolveParentEntryId(entry, parentField);
    if (parentId) {
      const next = new Set(expandedIds);
      let cur: string | null = parentId;
      const seen = new Set<string>();
      while (cur && !seen.has(cur)) {
        seen.add(cur);
        next.add(cur);
        const pe = wikiEntries.find(e => e.id === cur);
        cur = pe ? resolveParentEntryId(pe, parentField) : null;
      }
      persistExpanded(next);
    }
  };

  const handleNewPage = async (parentId?: string | null) => {
    if (!onEntryCreate || !trackId) return;
    const fieldKey = parentField.startsWith('custom_fields.')
      ? parentField.slice('custom_fields.'.length)
      : parentField;
    const custom_fields = parentId ? { [fieldKey]: parentId } : undefined;
    let pageType: string;
    try {
      pageType = await resolveWikiPageEntryTypeForTrack(trackId, view, parentField);
    } catch {
      showToast('This Wiki needs a page entry type with the selected parent relation', 'error');
      return;
    }
    const created = await onEntryCreate({
      title: 'Untitled',
      type: pageType,
      custom_fields,
    });
    if (created && typeof created === 'object' && 'id' in created) {
      const entry = created as Entry;
      setPendingEntry(entry);
      onEntryUpdate?.(entry);
      setSelectedId(entry.id);
      setOpenNewPageInEdit(true);
      if (parentId) {
        const next = new Set(expandedIds);
        let cur: string | null = parentId;
        const seen = new Set<string>();
        while (cur && !seen.has(cur)) {
          seen.add(cur);
          next.add(cur);
          // Annotated: without it `pe` and `cur` infer through each other
          // (pe from wikiEntries/pendingEntry, cur from pe) and TS reports a
          // circular implicit any.
          const pe: Entry | null =
            wikiEntries.find(e => e.id === cur) ||
            (pendingEntry?.id === cur ? pendingEntry : null);
          cur = pe ? resolveParentEntryId(pe, parentField) : null;
        }
        next.add(parentId);
        persistExpanded(next);
      }
    }
  };

  if (!parentField) {
    return (
      <div className="p-6 text-sm text-[var(--text-muted)]">
        Wiki view is missing <code className="text-[var(--text)]">parent_field</code> in
        view config.
      </div>
    );
  }

  if (isLoading && wikiEntries.length === 0) {
    return (
      <div className="flex min-h-[calc(100vh-14rem)] h-[calc(100vh-14rem)]">
        <div className="w-[260px] shrink-0 border-r border-[var(--panel-border)] p-3 space-y-2">
          {[1, 2, 3, 4, 5, 6].map(i => (
            <Skeleton key={i} className="h-7 w-full" />
          ))}
        </div>
        <div className="flex-1 p-10 space-y-4 max-w-3xl mx-auto w-full">
          <Skeleton className="h-10 w-3/4" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-2/3" />
        </div>
      </div>
    );
  }

  if (wikiEntries.length === 0) {
    return (
      emptyState || (
        <div className="py-16">
          <EmptyState
            icon={
              <IconWell size="lg" aria-hidden>
                <BookOpen size={22} strokeWidth={LINE_ICON_STROKE} />
              </IconWell>
            }
            title="No pages yet"
            description="Create your first page from the sidebar or switch to another view to add entries."
          />
        </div>
      )
    );
  }

  return (
    <div
      className="flex items-start bg-[var(--bg)]"
      data-view="wiki"
    >
      {sidebarOpen ? (
        <WikiPageSidebar
          entries={wikiEntries}
          parentField={parentField}
          titleField={titleField}
          sortSiblings={sortSiblings}
          selectedId={selectedId}
          expandedIds={expandedIds}
          onSelect={handleSelect}
          onToggle={handleToggle}
          onCollapse={() => setSidebarOpenPersisted(false)}
          onNewPage={isEditor && onEntryCreate ? handleNewPage : undefined}
          isEditor={isEditor}
          viewEntryTypeKeys={view.entry_type_keys}
        />
      ) : (
        <div className="shrink-0 flex flex-col items-center bg-[var(--panel-2)]/30 py-2 px-1">
          <button
            type="button"
            onClick={() => setSidebarOpenPersisted(true)}
            className="p-2 rounded-md text-[var(--text-subtle)] hover:text-[var(--text)] hover:bg-[var(--panel-2)]"
            aria-label="Show page list"
            title="Show pages"
          >
            <PanelLeft size={18} strokeWidth={LINE_ICON_STROKE} />
          </button>
        </div>
      )}

      <main className="flex-1 min-w-0 flex flex-col bg-[var(--bg)]">
        {selectedEntry ? (
          <WikiPageWorkspace
            entry={selectedEntry}
            allEntries={wikiEntries}
            parentField={parentField}
            bodyField={bodyField}
            titleField={titleField}
            onSelectPage={handleSelect}
            isEditor={isEditor}
            publicPermissions={publicPermissions}
            publicToken={publicToken}
            onEntryUpdate={u => {
              if (pendingEntry?.id === u.id) setPendingEntry(u);
              onEntryUpdate?.(u);
            }}
            onEntryDelete={entryId => {
              if (pendingEntry?.id === entryId) setPendingEntry(null);
              onEntryDelete?.(entryId);
            }}
            viewEntryTypeKeys={view.entry_type_keys}
            initialEditMode={openNewPageInEdit && selectedEntry?.id === selectedId}
            onEditModeChange={active => {
              if (!active) setOpenNewPageInEdit(false);
            }}
            sidebarOpen={sidebarOpen}
          />
        ) : (
          <div className="flex-1 flex items-center justify-center text-sm text-[var(--text-subtle)]">
            Select a page from the sidebar
          </div>
        )}
      </main>
    </div>
  );
}

export const WikiWidget = WikiWidgetInner;
