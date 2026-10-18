import { useCallback } from "react";
import { useLocation, useParams } from "react-router-dom";
import { useCrumbs } from "../../context/CrumbsContext";
import { useChatPageContext, useChatPageDialogContext } from "../../context/ChatPageFocusContext";
import type {
  ChatPageBreadcrumb,
  ChatPageContextPayload,
  ChatPagePublishedContext,
  ChatPageVisibleData,
} from "../../types/chatPageContext";
import { MAX_VISIBLE_CONTEXT_ITEMS } from "../../types/chatPageContext";

function parseSearchParams(search: string): Record<string, string> | undefined {
  if (!search || search === "?") return undefined;
  const raw = search.startsWith("?") ? search.slice(1) : search;
  if (!raw) return undefined;
  const out: Record<string, string> = {};
  for (const part of raw.split("&")) {
    if (!part) continue;
    const [key, ...rest] = part.split("=");
    if (!key) continue;
    out[decodeURIComponent(key)] = decodeURIComponent(rest.join("=") || "");
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

function capVisibleData(
  visibleData: ChatPageVisibleData | null,
): ChatPageVisibleData | undefined {
  if (!visibleData) return undefined;

  const entries = visibleData.entries;
  const tracks = visibleData.tracks;
  const out: ChatPageVisibleData = {};
  let any = false;
  let maxTotal = visibleData.total_count;

  if (entries?.length) {
    any = true;
    const total = entries.length;
    out.entries = entries.slice(0, MAX_VISIBLE_CONTEXT_ITEMS).map((e) => ({
      id: e.id,
      ...(e.title !== undefined ? { title: e.title } : {}),
      ...(e.status !== undefined ? { status: e.status } : {}),
      ...(e.entry_type !== undefined ? { entry_type: e.entry_type } : {}),
    }));
    if (total > MAX_VISIBLE_CONTEXT_ITEMS) {
      maxTotal = Math.max(maxTotal ?? 0, total);
    }
  }

  if (tracks?.length) {
    any = true;
    const total = tracks.length;
    out.tracks = tracks.slice(0, MAX_VISIBLE_CONTEXT_ITEMS).map((t) => ({
      id: t.id,
      ...(t.title !== undefined ? { title: t.title } : {}),
    }));
    if (total > MAX_VISIBLE_CONTEXT_ITEMS) {
      maxTotal = Math.max(maxTotal ?? 0, total);
    }
  }

  if (maxTotal !== undefined) {
    out.total_count = maxTotal;
  } else if (visibleData.total_count !== undefined) {
    out.total_count = visibleData.total_count;
    any = true;
  }

  return any || out.total_count !== undefined ? out : undefined;
}

function crumbsToPayload(
  crumbs: { label: string; to?: string }[],
): ChatPageBreadcrumb[] | undefined {
  if (!crumbs.length) return undefined;
  return crumbs.map((c) => ({
    label: c.label,
    ...(c.to ? { to: c.to } : {}),
  }));
}

export interface BuildChatPageContextSnapshotInput {
  pathname: string;
  search: string;
  routeParams: Record<string, string | undefined>;
  breadcrumbs: { label: string; to?: string }[];
  published: ChatPagePublishedContext;
  dialog?: ChatPagePublishedContext | null;
}

/** When a dialog is open, its context replaces list/page visible data. */
export function mergeDialogPageContext(
  page: ChatPagePublishedContext,
  dialog: ChatPagePublishedContext | null | undefined,
): ChatPagePublishedContext {
  if (!dialog) return page;
  const metadata: Record<string, unknown> = {
    ...(page.metadata ?? {}),
    ...(dialog.metadata ?? {}),
  };
  if (page.pageKind) {
    metadata.parent_page_kind = page.pageKind;
  }
  return {
    pageKind: dialog.pageKind ?? 'entry_dialog',
    focusedTrackId: dialog.focusedTrackId ?? page.focusedTrackId,
    focusedViewId: dialog.focusedViewId ?? page.focusedViewId,
    focusedAppId: dialog.focusedAppId ?? page.focusedAppId,
    focusedEntryId: dialog.focusedEntryId ?? page.focusedEntryId,
    visibleData: dialog.visibleData ?? null,
    metadata: Object.keys(metadata).length > 0 ? metadata : null,
  };
}

/** Pure helper — unit-testable snapshot assembly with caps applied. */
export function buildChatPageContextSnapshot(
  input: BuildChatPageContextSnapshotInput,
): ChatPageContextPayload {
  const { pathname, search, routeParams, breadcrumbs, published, dialog } = input;
  const effective = mergeDialogPageContext(published, dialog);

  const route_params: Record<string, string> = {};
  for (const [key, value] of Object.entries(routeParams)) {
    if (value !== undefined) route_params[key] = value;
  }

  const search_params = parseSearchParams(search);
  const url = search ? `${pathname}${search}` : pathname;
  const visible_data = capVisibleData(effective.visibleData);

  const payload: ChatPageContextPayload = {
    url,
    route_path: pathname,
  };

  if (Object.keys(route_params).length > 0) payload.route_params = route_params;
  if (search_params) payload.search_params = search_params;
  if (effective.pageKind) payload.page_kind = effective.pageKind;

  const crumbPayload = crumbsToPayload(breadcrumbs);
  if (crumbPayload?.length) payload.breadcrumbs = crumbPayload;

  if (effective.focusedTrackId) {
    payload.focused_track_id = effective.focusedTrackId;
  }
  if (effective.focusedViewId) {
    payload.focused_view_id = effective.focusedViewId;
  }
  if (effective.focusedAppId) {
    payload.focused_app_id = effective.focusedAppId;
  }
  if (effective.focusedEntryId) {
    payload.focused_entry_id = effective.focusedEntryId;
  }
  if (visible_data) payload.visible_data = visible_data;
  if (effective.metadata && Object.keys(effective.metadata).length > 0) {
    payload.metadata = effective.metadata;
  }

  return payload;
}

/** Returns a function that snapshots current route + page context at send time. */
export function useChatPageContextSnapshot() {
  const location = useLocation();
  const routeParams = useParams();
  const { crumbs } = useCrumbs();
  const pagePublished = useChatPageContext();
  const dialogPublished = useChatPageDialogContext();

  return useCallback((): ChatPageContextPayload => {
    const published: ChatPagePublishedContext = {
      pageKind: pagePublished.pageKind,
      focusedTrackId: pagePublished.focusedTrackId,
      focusedViewId: pagePublished.focusedViewId,
      focusedAppId: pagePublished.focusedAppId,
      focusedEntryId: pagePublished.focusedEntryId,
      visibleData: pagePublished.visibleData,
      metadata: pagePublished.metadata,
    };
    const dialog: ChatPagePublishedContext | null = dialogPublished
      ? {
          pageKind: dialogPublished.pageKind,
          focusedTrackId: dialogPublished.focusedTrackId,
          focusedViewId: dialogPublished.focusedViewId,
          focusedAppId: dialogPublished.focusedAppId,
          focusedEntryId: dialogPublished.focusedEntryId,
          visibleData: dialogPublished.visibleData,
          metadata: dialogPublished.metadata,
        }
      : null;

    return buildChatPageContextSnapshot({
      pathname: location.pathname,
      search: location.search,
      routeParams,
      breadcrumbs: crumbs,
      published,
      dialog,
    });
  }, [
    location.pathname,
    location.search,
    routeParams,
    crumbs,
    pagePublished.pageKind,
    pagePublished.focusedTrackId,
    pagePublished.focusedViewId,
    pagePublished.focusedAppId,
    pagePublished.focusedEntryId,
    pagePublished.visibleData,
    pagePublished.metadata,
    dialogPublished,
  ]);
}
