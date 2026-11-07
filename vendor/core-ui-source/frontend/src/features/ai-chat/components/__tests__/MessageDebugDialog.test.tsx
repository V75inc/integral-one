import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { MessageDebugDialog } from "../MessageDebugDialog";
import { compactMessageDebugPayload } from "../assistantMessagePresentation";

vi.mock("../../../../context/ThemeContext", () => ({
  useTheme: () => ({ theme: "light" }),
  useOptionalTheme: () => ({ theme: "light" }),
}));

describe("MessageDebugDialog", () => {
  it("shows QuerySpec provenance and its receipt reference", () => {
    render(
      <MessageDebugDialog
        messageContent="Done"
        payload={{
          claim_provenance: {
            tools: [
              {
                name: "integral_query_spec",
                source: "query",
                status: "complete",
                result_set_id: "result-set-1",
                run_id: "query-run-1",
                graph_revision: "sha256:graph-revision",
                receipt: {
                  run_id: "query-run-1",
                  step_key: "capability:query-step",
                },
              },
            ],
          },
        }}
        onClose={vi.fn()}
      />,
    );

    expect(
      screen.getByRole("heading", { name: "Query result provenance" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Run receipt" }),
    ).toBeInTheDocument();
    expect(screen.getAllByText(/result-set-1/).length).toBeGreaterThan(0);
  });

  it("never labels page context as a result set", () => {
    render(
      <MessageDebugDialog
        messageContent="Done"
        payload={{
          claim_provenance: {
            tools: [
              {
                name: "integral_get_page_context",
                source: "page_context",
                status: "complete",
                result_set_id: "spoofed-page-result-set",
              },
            ],
          },
        }}
        onClose={vi.fn()}
      />,
    );

    expect(
      screen.queryByRole("heading", { name: "Query result provenance" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "Run receipt" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Claim provenance" }),
    ).toBeInTheDocument();
  });
});


describe("compact request diagnostics", () => {
  it("omits empty optional sessions and duplicate focus without changing the source", () => {
    const payload = { request: {
      session_id: null, focused_space_id: "app-1", focused_track_id: "track-1",
      focused_view_id: null,
      page_context: { focused_app_id: "app-1", focused_track_id: "track-1", focused_view_id: null },
    }};
    const compact = compactMessageDebugPayload(payload);
    expect(compact.request).toEqual({ page_context: { focused_app_id: "app-1", focused_track_id: "track-1" }});
    expect(payload.request.session_id).toBeNull();
    expect(payload.request.focused_space_id).toBe("app-1");
    expect(payload.request.page_context.focused_view_id).toBeNull();
  });

  it("retains populated sessions, conflicting focus and unknown evidence", () => {
    const payload = { request: {
      session_id: "persistent-session", focused_space_id: "app-1",
      page_context: { focused_app_id: "app-2", permission: false },
      provider_cost: null, results: [], extension: null,
    }, response: { error: true } };
    expect(compactMessageDebugPayload(payload)).toEqual(payload);
  });
});
