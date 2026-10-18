/** Summary of an entry visible on the current page (capped list). */
export interface ChatPageVisibleEntry {
  id: string;
  title?: string;
  status?: string;
  entry_type?: string;
}

/** Summary of a track visible on the current page (capped list). */
export interface ChatPageVisibleTrack {
  id: string;
  title?: string;
}

/** On-screen data the page publishes for agent context. */
export interface ChatPageVisibleData {
  entries?: ChatPageVisibleEntry[];
  tracks?: ChatPageVisibleTrack[];
  /** Set when the source list exceeds the cap. */
  total_count?: number;
}

export interface ChatPageBreadcrumb {
  label: string;
  to?: string;
}

/** Full page context snapshotted at send time and forwarded to the backend. */
export interface ChatPageContextPayload {
  url: string;
  route_path: string;
  route_params?: Record<string, string>;
  search_params?: Record<string, string>;
  page_kind?: string;
  breadcrumbs?: ChatPageBreadcrumb[];
  focused_track_id?: string;
  focused_view_id?: string;
  focused_app_id?: string;
  focused_entry_id?: string;
  visible_data?: ChatPageVisibleData;
  metadata?: Record<string, unknown>;
}

/** Fields pages publish into ChatPageFocusContext. */
export interface ChatPagePublishedContext {
  pageKind: string | null;
  focusedTrackId: string | null;
  focusedViewId: string | null;
  focusedAppId: string | null;
  focusedEntryId: string | null;
  visibleData: ChatPageVisibleData | null;
  metadata: Record<string, unknown> | null;
}

export const MAX_VISIBLE_CONTEXT_ITEMS = 8;
