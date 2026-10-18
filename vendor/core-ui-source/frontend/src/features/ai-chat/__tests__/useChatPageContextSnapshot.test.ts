import { describe, expect, it } from "vitest";
import {
  buildChatPageContextSnapshot,
  mergeDialogPageContext,
} from "../useChatPageContextSnapshot";
import { MAX_VISIBLE_CONTEXT_ITEMS } from "../../../types/chatPageContext";

describe("buildChatPageContextSnapshot", () => {
  it("assembles url, route, crumbs, and published context", () => {
    const snapshot = buildChatPageContextSnapshot({
      pathname: "/tracks/n.Track.abc",
      search: "?entry=n.Entry.1",
      routeParams: { id: "n.Track.abc" },
      breadcrumbs: [
        { label: "Home", to: "/" },
        { label: "Sprint board" },
      ],
      published: {
        pageKind: "track_detail",
        focusedTrackId: "n.Track.abc",
        focusedViewId: "n.View.1",
        focusedAppId: "n.WorkspaceApp.venture-journey",
        focusedEntryId: "n.Entry.1",
        visibleData: {
          entries: [
            {
              id: "n.Entry.1",
              title: "Ship auth",
              status: "open",
              entry_type: "task",
            },
          ],
        },
        metadata: { view_name: "Calendar" },
      },
    });

    expect(snapshot).toEqual({
      url: "/tracks/n.Track.abc?entry=n.Entry.1",
      route_path: "/tracks/n.Track.abc",
      route_params: { id: "n.Track.abc" },
      search_params: { entry: "n.Entry.1" },
      page_kind: "track_detail",
      breadcrumbs: [
        { label: "Home", to: "/" },
        { label: "Sprint board" },
      ],
      focused_track_id: "n.Track.abc",
      focused_view_id: "n.View.1",
      focused_app_id: "n.WorkspaceApp.venture-journey",
      focused_entry_id: "n.Entry.1",
      visible_data: {
        entries: [
          {
            id: "n.Entry.1",
            title: "Ship auth",
            status: "open",
            entry_type: "task",
          },
        ],
      },
      metadata: { view_name: "Calendar" },
    });
  });

  it("caps visible entries and sets total_count", () => {
    const entries = Array.from({ length: MAX_VISIBLE_CONTEXT_ITEMS + 5 }, (_, i) => ({
      id: `n.Entry.${i}`,
      title: `Entry ${i}`,
    }));

    const snapshot = buildChatPageContextSnapshot({
      pathname: "/feed",
      search: "",
      routeParams: {},
      breadcrumbs: [],
      published: {
        pageKind: "feed",
        focusedTrackId: null,
        focusedViewId: null,
        focusedAppId: null,
        focusedEntryId: null,
        visibleData: { entries },
        metadata: null,
      },
    });

    expect(snapshot.visible_data?.entries).toHaveLength(MAX_VISIBLE_CONTEXT_ITEMS);
    expect(snapshot.visible_data?.total_count).toBe(MAX_VISIBLE_CONTEXT_ITEMS + 5);
  });

  it("keeps both tracks and entries when published together", () => {
    const snapshot = buildChatPageContextSnapshot({
      pathname: "/",
      search: "",
      routeParams: {},
      breadcrumbs: [],
      published: {
        pageKind: "mission_control",
        focusedTrackId: null,
        focusedViewId: null,
        focusedAppId: null,
        focusedEntryId: null,
        visibleData: {
          tracks: [{ id: "n.Track.1", title: "A" }],
          entries: [{ id: "n.Entry.1", title: "E" }],
          total_count: 40,
        },
        metadata: null,
      },
    });

    expect(snapshot.visible_data?.tracks).toHaveLength(1);
    expect(snapshot.visible_data?.entries).toHaveLength(1);
    expect(snapshot.visible_data?.total_count).toBe(40);
  });

  it("dialog context overrides page visible data and page_kind", () => {
    const snapshot = buildChatPageContextSnapshot({
      pathname: "/feed",
      search: "",
      routeParams: {},
      breadcrumbs: [{ label: "Feed" }],
      published: {
        pageKind: "feed",
        focusedTrackId: null,
        focusedViewId: null,
        focusedAppId: null,
        focusedEntryId: null,
        visibleData: {
          entries: [
            { id: "n.Entry.1", title: "First" },
            { id: "n.Entry.2", title: "Second" },
          ],
        },
        metadata: { feed_scope: "all" },
      },
      dialog: {
        pageKind: "entry_dialog",
        focusedTrackId: "n.Track.abc",
        focusedViewId: null,
        focusedAppId: null,
        focusedEntryId: "n.Entry.1",
        visibleData: {
          entries: [
            {
              id: "n.Entry.1",
              title: "First",
              status: "open",
              entry_type: "task",
            },
          ],
        },
        metadata: { entry_title: "First", track_title: "Sprint" },
      },
    });

    expect(snapshot.page_kind).toBe("entry_dialog");
    expect(snapshot.focused_entry_id).toBe("n.Entry.1");
    expect(snapshot.focused_track_id).toBe("n.Track.abc");
    expect(snapshot.visible_data?.entries).toHaveLength(1);
    expect(snapshot.metadata).toMatchObject({
      feed_scope: "all",
      entry_title: "First",
      track_title: "Sprint",
      parent_page_kind: "feed",
    });
  });
});

describe("mergeDialogPageContext", () => {
  it("returns page context when dialog is null", () => {
    const page = {
      pageKind: "track_detail",
      focusedTrackId: "n.Track.1",
      focusedViewId: null,
      focusedAppId: null,
      focusedEntryId: null,
      visibleData: { entries: [{ id: "n.Entry.1" }] },
      metadata: null,
    };
    expect(mergeDialogPageContext(page, null)).toBe(page);
  });
});

// Existing publishers already carry saved View identity; snapshot it per send.
describe("selected view and page section context", () => {
  it.each(["kanban", "table", "calendar", "gallery"])("retains the selected %s View", viewType => {
    const snapshot = buildChatPageContextSnapshot({
      pathname: "/tracks/n.Track.1",
      search: "?view_id=n.View.1",
      routeParams: {},
      breadcrumbs: [],
      published: {
        pageKind: "track_detail",
        focusedTrackId: "n.Track.1",
        focusedViewId: "n.View.1",
        focusedAppId: "n.WorkspaceApp.1",
        focusedEntryId: null,
        visibleData: null,
        metadata: { view_type: viewType, view_name: "Selected View", group_by: "stage" },
      },
    });
    expect(snapshot.focused_view_id).toBe("n.View.1");
    expect(snapshot.metadata?.view_type).toBe(viewType);
    expect(snapshot.metadata?.group_by).toBe("stage");
  });

  it("reports an App section without inventing a saved View", () => {
    const snapshot = buildChatPageContextSnapshot({
      pathname: "/apps/n.WorkspaceApp.1",
      search: "",
      routeParams: {},
      breadcrumbs: [],
      published: {
        pageKind: "app_detail", focusedAppId: "n.WorkspaceApp.1",
        focusedTrackId: null, focusedViewId: null, focusedEntryId: null,
        visibleData: null, metadata: { app_name: "CRM", app_section: "tracks" },
      },
    });
    expect(snapshot.focused_view_id).toBeUndefined();
    expect(snapshot.metadata?.app_section).toBe("tracks");
  });
});
