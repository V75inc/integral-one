import { useMemo, useState } from 'react';
import {
  ChevronDown,
  ChevronRight,
  FileText,
  PanelLeftClose,
  Plus,
  Search,
  X,
} from 'lucide-react';
import type { Entry } from '../../../types';
import { LINE_ICON_STROKE } from '../../ui';
import {
  buildPageTree,
  filterEntriesBySearch,
  type SortSiblingsConfig,
  type WikiTreeNode,
} from './buildPageTree';
import { getEntryTitle } from './wikiFieldAccess';

const INDENT_PX = 14;

/** Whether hover "add inside" is offered for this row (view slice + editor). */
export function canAddPageInside(
  entry: Entry,
  viewEntryTypeKeys?: string[]
): boolean {
  const t = (entry.type || '').toLowerCase().trim();
  const keys = (viewEntryTypeKeys || []).map(k => k.toLowerCase().trim()).filter(Boolean);
  if (keys.length) return keys.includes(t);
  return t === 'page' || t === 'doc';
}

function WikiTreeRow({
  node,
  depth,
  selectedId,
  expandedIds,
  titleField,
  onSelect,
  onToggle,
  onAddInside,
  isEditor,
  viewEntryTypeKeys,
}: {
  node: WikiTreeNode;
  depth: number;
  selectedId: string | null;
  expandedIds: Set<string>;
  titleField: string;
  onSelect: (entry: Entry) => void;
  onToggle: (id: string) => void;
  onAddInside?: (parentId: string) => void;
  isEditor?: boolean;
  viewEntryTypeKeys?: string[];
}) {
  const hasChildren = node.children.length > 0;
  const isExpanded = expandedIds.has(node.entry.id);
  const isSelected = selectedId === node.entry.id;
  const label = getEntryTitle(node.entry, titleField);
  const showAddInside =
    isEditor &&
    onAddInside &&
    canAddPageInside(node.entry, viewEntryTypeKeys);

  return (
    <div role="none">
      <div
        className={`group flex items-center min-w-0 rounded-md transition-colors ${
          isSelected
            ? 'bg-[var(--nav-active-bg)] text-[var(--nav-active-fg)]'
            : 'text-[var(--text-muted)] hover:bg-[var(--panel-2)] hover:text-[var(--text)]'
        }`}
        style={{ marginLeft: depth * INDENT_PX }}
      >
        <button
          type="button"
          onClick={e => {
            e.stopPropagation();
            if (hasChildren) onToggle(node.entry.id);
          }}
          className={`shrink-0 flex items-center justify-center w-6 h-8 rounded-sm ${
            hasChildren
              ? 'opacity-70 hover:opacity-100'
              : 'opacity-0 pointer-events-none'
          }`}
          aria-label={isExpanded ? 'Collapse section' : 'Expand section'}
          tabIndex={hasChildren ? 0 : -1}
        >
          {hasChildren ? (
            isExpanded ? (
              <ChevronDown size={14} strokeWidth={LINE_ICON_STROKE} />
            ) : (
              <ChevronRight size={14} strokeWidth={LINE_ICON_STROKE} />
            )
          ) : null}
        </button>
        <button
          type="button"
          onClick={() => onSelect(node.entry)}
          className="flex flex-1 items-center gap-2 min-w-0 py-1.5 pl-0 pr-1 text-left text-[13px] leading-snug"
        >
          <FileText
            size={14}
            strokeWidth={LINE_ICON_STROKE}
            className={`shrink-0 ${isSelected ? 'opacity-90' : 'opacity-50'}`}
            aria-hidden
          />
          <span className="truncate">{label}</span>
        </button>
        {showAddInside ? (
          <button
            type="button"
            onClick={e => {
              e.stopPropagation();
              onAddInside(node.entry.id);
            }}
            className="shrink-0 mr-1 flex items-center justify-center w-6 h-6 rounded opacity-0 group-hover:opacity-100 focus:opacity-100 text-[var(--text-subtle)] hover:text-[var(--text)] hover:bg-[var(--panel-2)] transition-opacity"
            aria-label={`Add page inside ${label}`}
            title="Add page inside"
          >
            <Plus size={14} strokeWidth={LINE_ICON_STROKE} />
          </button>
        ) : (
          <span className="w-7 shrink-0" aria-hidden />
        )}
      </div>
      {hasChildren && isExpanded ? (
        <div className="mt-0.5">
          {node.children.map(child => (
            <WikiTreeRow
              key={child.entry.id}
              node={child}
              depth={depth + 1}
              selectedId={selectedId}
              expandedIds={expandedIds}
              titleField={titleField}
              onSelect={onSelect}
              onToggle={onToggle}
              onAddInside={onAddInside}
              isEditor={isEditor}
              viewEntryTypeKeys={viewEntryTypeKeys}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function SearchResultRow({
  entry,
  selectedId,
  titleField,
  onSelect,
}: {
  entry: Entry;
  selectedId: string | null;
  titleField: string;
  onSelect: (entry: Entry) => void;
}) {
  const isSelected = selectedId === entry.id;
  const label = getEntryTitle(entry, titleField);
  return (
    <button
      type="button"
      onClick={() => onSelect(entry)}
      className={`w-full flex items-center gap-2 min-w-0 py-2 px-2.5 rounded-md text-left text-[13px] transition-colors ${
        isSelected
          ? 'bg-[var(--nav-active-bg)] text-[var(--nav-active-fg)]'
          : 'text-[var(--text-muted)] hover:bg-[var(--panel-2)] hover:text-[var(--text)]'
      }`}
    >
      <FileText size={14} strokeWidth={LINE_ICON_STROKE} className="shrink-0 opacity-50" />
      <span className="truncate">{label}</span>
    </button>
  );
}

export interface WikiPageSidebarProps {
  entries: Entry[];
  parentField: string;
  titleField: string;
  sortSiblings?: SortSiblingsConfig;
  selectedId: string | null;
  expandedIds: Set<string>;
  onSelect: (entry: Entry) => void;
  onToggle: (id: string) => void;
  onCollapse: () => void;
  onNewPage?: (parentId?: string | null) => void;
  isEditor?: boolean;
  viewEntryTypeKeys?: string[];
}

export function WikiPageSidebar({
  entries,
  parentField,
  titleField,
  sortSiblings,
  selectedId,
  expandedIds,
  onSelect,
  onToggle,
  onCollapse,
  onNewPage,
  isEditor,
  viewEntryTypeKeys,
}: WikiPageSidebarProps) {
  const [search, setSearch] = useState('');

  const tree = useMemo(
    () => buildPageTree(entries, parentField, sortSiblings),
    [entries, parentField, sortSiblings]
  );

  const searchResults = useMemo(() => {
    if (!search.trim()) return null;
    return filterEntriesBySearch(entries, search, titleField);
  }, [entries, search, titleField]);

  return (
    <aside
      className="flex flex-col w-[240px] shrink-0 sticky self-start overflow-hidden bg-[var(--panel-2)]/30"
      style={{
        top: 'calc(var(--system-bar-h, 0px) + 1rem)',
        maxHeight: 'calc(100vh - var(--system-bar-h, 0px) - 2rem)',
      }}
    >
      <div className="flex items-center justify-between gap-1 pt-3 pb-2 shrink-0">
        <span className="text-xs font-semibold uppercase tracking-wider text-[var(--text-subtle)]">
          Pages
        </span>
        <div className="flex items-center gap-0.5">
          {isEditor && onNewPage ? (
            <button
              type="button"
              onClick={() => onNewPage(null)}
              className="p-1.5 rounded-md text-[var(--text-subtle)] hover:text-[var(--text)] hover:bg-[var(--panel-2)]"
              aria-label="New page"
              title="New page"
            >
              <Plus size={16} strokeWidth={LINE_ICON_STROKE} />
            </button>
          ) : null}
          <button
            type="button"
            onClick={onCollapse}
            className="p-1.5 rounded-md text-[var(--text-subtle)] hover:text-[var(--text)] hover:bg-[var(--panel-2)]"
            aria-label="Hide page list"
          >
            <PanelLeftClose size={16} strokeWidth={LINE_ICON_STROKE} />
          </button>
        </div>
      </div>

      <div className="pb-2 shrink-0">
        <div className="relative">
          <Search
            size={14}
            strokeWidth={LINE_ICON_STROKE}
            className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--text-subtle)] pointer-events-none"
            aria-hidden
          />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search pages…"
            className="w-full pl-9 pr-8 py-1.5 text-sm rounded-md border border-[var(--panel-border)] bg-[var(--panel-2)] text-[var(--text)] placeholder:text-[var(--text-subtle)] focus:outline-none focus:ring-2 focus:ring-[var(--focus-ring-color)]"
            aria-label="Search pages"
            autoComplete="off"
          />
          {search ? (
            <button
              type="button"
              onClick={() => setSearch('')}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 p-1 rounded text-[var(--text-subtle)] hover:text-[var(--text)]"
              aria-label="Clear search"
            >
              <X size={14} strokeWidth={LINE_ICON_STROKE} />
            </button>
          ) : null}
        </div>
      </div>

      <nav
        aria-label="Pages"
        className="flex-1 min-h-0 overflow-y-auto pb-3 wiki-sidebar-scroll"
        style={{ scrollbarWidth: 'thin' }}
      >
        {searchResults ? (
          searchResults.length === 0 ? (
            <p className="px-2 py-4 text-xs text-[var(--text-subtle)]">No pages match.</p>
          ) : (
            <div className="space-y-0.5">
              {searchResults.map(entry => (
                <SearchResultRow
                  key={entry.id}
                  entry={entry}
                  selectedId={selectedId}
                  titleField={titleField}
                  onSelect={onSelect}
                />
              ))}
            </div>
          )
        ) : tree.roots.length === 0 ? (
          <p className="px-2 py-4 text-xs text-[var(--text-subtle)]">
            No pages yet. Use + above to add one.
          </p>
        ) : (
          <div className="space-y-0.5">
            {tree.roots.map(node => (
              <WikiTreeRow
                key={node.entry.id}
                node={node}
                depth={0}
                selectedId={selectedId}
                expandedIds={expandedIds}
                titleField={titleField}
                onSelect={onSelect}
                onToggle={onToggle}
                onAddInside={isEditor && onNewPage ? onNewPage : undefined}
                isEditor={isEditor}
                viewEntryTypeKeys={viewEntryTypeKeys}
              />
            ))}
          </div>
        )}
      </nav>
    </aside>
  );
}
