import type { Entry, EntryTypeNode, SavedView, Track } from '../types';

export interface EntryCreateInput {
  /** Calendar additions need a draft form before persistence. */
  source?: 'calendar';
  /** Resolved target of an embedded view. */
  track_id?: string;
  title: string;
  type?: string;
  custom_fields?: Record<string, unknown>;
}

export interface ViewWidgetProps {
  entries: Entry[];
  view: SavedView;
  isLoading: boolean;
  onEntryOpen: (entry: Entry, opts?: { focusComments?: boolean }) => void;
  onEntryDelete?: (entryId: string) => void;
  /** Refetch / rollback when a widget-initiated delete fails after optimistic UI. */
  onEntryDeleteFailed?: () => void;
  onEntryEdit?: (entry: Entry) => void;
  onEntryUpdate?: (entry: Entry) => void;
  onEntryPersist?: (entry: Entry) => Promise<Entry | void> | Entry | void;
  onViewUpdate?: (view: SavedView) => void;
  onEntryCreate?: (input: EntryCreateInput) => Promise<Entry | void> | Entry | void;
  commentCounts?: Record<string, number>;
  entryTypeSlugs?: string[];
  filterType?: string;
  onFilterChange?: (type: string) => void;
  fetchMore?: () => void;
  hasNextPage?: boolean;
  isFetchingNext?: boolean;
  emptyState?: React.ReactNode;
  isEditor?: boolean;
  publicPermissions?: Record<string, boolean>;
  publicToken?: string;
  /** Track context for per-entry edit rights in card widgets. */
  track?: Track;
  /** Active entry-type field specs for the entries on screen. Widgets need
   *  this to know which columns / template tokens are relation-typed so
   *  ids can be resolved to labels. Passed by ViewRenderer. */
  fields?: import('../types').OperationalModelFieldSpec[];
  /** Live entry-type nodes on the track — calendar/wiki resolvers need schema per type. */
  entryTypes?: EntryTypeNode[];
  /** Track-level ``defaults.default_entry_type`` manifest key for view create resolvers. */
  trackDefaultEntryTypeKey?: string;
  /** When kanban ``group_by`` targets a profile select field, append new
   *  column keys to that field's enum before persisting ``kanban_columns``. */
  onKanbanColumnEnumSync?: (params: {
    fieldKey: string;
    columnKey: string;
  }) => Promise<void>;
}

export interface WidgetMeta {
  label: string;
  icon: React.ComponentType<Record<string, unknown>>;
  description: string;
}

export interface WidgetRegistration {
  type: string;
  component: React.ComponentType<ViewWidgetProps>;
  meta: WidgetMeta;
  composite?: { base: string; config?: Record<string, unknown> };
  source?: 'builtin' | 'composite' | 'plugin';
  signed?: boolean;
  /**
   * Where this view type is meaningful. `'track'` (default, omit for every
   * ordinary listing/board/calendar/etc widget) — addressable as one of a
   * track's own tabs, receives every matching entry in the track.
   * `'entry'` — only makes sense bound inside a SPECIFIC entry's own
   * `related_views[]` (action bars, summary tiles, a reverse-relation
   * list, a composed single-entry form/layout region): every button/tile/
   * field it renders is scoped to that one entry's id, so showing it as a
   * track-level tab has no entry to act against and its own name (e.g.
   * "Pay Run Actions") leaks in as a bare, non-functional tab. Track
   * pages exclude `scope: 'entry'` views from their tab candidates —
   * see `TrackDetailPage.tsx`. `'both'` — valid in either placement (e.g. a
   * chart region usable as a standalone track view OR bound inside a
   * single entry's `related_views`) — excluded from neither.
   */
  scope?: 'track' | 'entry' | 'both';
}

export interface WidgetCapabilityDescriptor {
  capability: string;
  label: string;
  description: string;
}
