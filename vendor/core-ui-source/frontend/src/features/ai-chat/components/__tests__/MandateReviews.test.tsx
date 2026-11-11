import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { expect, it, vi } from "vitest";

import { aiChatApi, type ChatMandateReview } from "../../../../api/aiChat";
import { MandateReviews } from "../MandateReviews";

vi.mock("../../../../api/aiChat", () => ({
  aiChatApi: {
    listMandateReviews: vi.fn(),
    getMandateReview: vi.fn(),
    actOnMandateReview: vi.fn(),
    proposeEntryReadMandate: vi.fn(),
  },
}));

it("approves and runs the exact displayed revision in its conversation", async () => {
  const review: ChatMandateReview = {
    work_item_id: "work",
    work_status: "waiting_for_human",
    approval_status: "pending",
    review_digest: "exact-digest",
    execution_enabled: true,
    entry_read_preflight: "current",
    model_route_preflight: "current",
    terms: {
      goal: "Summarize the reviewed evidence",
      revision: 2,
      limits: {
        deadline_at: "2030-01-01T10:00:00Z",
        currency: "USD",
        max_spend: "0.25",
        max_model_requests: 1,
        max_tool_calls: 1,
        max_internal_writes: 0,
        max_external_effects: 0,
      },
      grants: [],
      external_grants: [],
      model_routes: [],
      entry_source_revisions: [{ entry_id: "entry-one", record_revision: 4 }],
      success_criteria: ["Cite the reviewed source"],
      stop_conditions: [],
      result_obligations: [],
    },
  };
  vi.mocked(aiChatApi.listMandateReviews).mockResolvedValue({
    can_propose: false,
    reviews: [{ work_item_id: "work", work_status: review.work_status, goal: review.terms.goal }],
  });
  vi.mocked(aiChatApi.getMandateReview).mockImplementation(async () => ({ ...review }));
  vi.mocked(aiChatApi.actOnMandateReview).mockImplementation(async (_, __, action) => {
    if (action === "approve") review.approval_status = "approved";
    if (action === "run") review.work_status = "queued";
    if (action === "stop") {
      review.work_status = "running";
      review.cancel_requested = true;
    }
  });

  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MandateReviews threadId="thread" workspaceId="workspace" />
    </QueryClientProvider>,
  );
  fireEvent.click(await screen.findByText("Mandate reviews (1)"));
  fireEvent.click(screen.getByText(review.terms.goal));
  expect(await screen.findByText("entry-one · revision 4")).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Run" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Approve" }));
  const run = await screen.findByRole("button", { name: "Run" });
  await waitFor(() => expect((run as HTMLButtonElement).disabled).toBe(false));
  fireEvent.click(run);
  await waitFor(() => expect(screen.getByRole("status").textContent).toContain("queued"));
  expect(aiChatApi.actOnMandateReview).toHaveBeenNthCalledWith(1, "thread", "work", "approve", "exact-digest");
  expect(aiChatApi.actOnMandateReview).toHaveBeenNthCalledWith(2, "thread", "work", "run", "exact-digest");

  const stop = screen.getByRole("button", { name: "Stop" });
  await waitFor(() => expect((stop as HTMLButtonElement).disabled).toBe(false));
  fireEvent.click(stop);
  expect(await screen.findByText("Stop requested")).toBeTruthy();
  expect(aiChatApi.actOnMandateReview).toHaveBeenNthCalledWith(3, "thread", "work", "stop", "exact-digest");
  expect(screen.queryByRole("button", { name: "Stop" })).toBeNull();

  vi.useFakeTimers();
  try {
    review.work_status = "cancelled";
    review.accounting = { status: "awaiting_receipt", reserved_usd: "0", charged_usd: null };
    await act(async () => {
      await client.invalidateQueries({
        queryKey: ["chat-mandate-reviews", "workspace", "thread", "work"],
      });
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(screen.getByText(/Provider cost is unconfirmed/)).toBeTruthy();
    expect(screen.queryByText("Provider cost USD 0")).toBeNull();

    const panel = screen.getByText("Mandate reviews (1)");
    fireEvent.click(panel);
    await act(async () => vi.advanceTimersByTimeAsync(1));
    const readsWhileClosed = vi.mocked(aiChatApi.getMandateReview).mock.calls.length;
    await act(async () => vi.advanceTimersByTimeAsync(60_000));
    expect(aiChatApi.getMandateReview).toHaveBeenCalledTimes(readsWhileClosed);
    fireEvent.click(panel);
    await act(async () => vi.advanceTimersByTimeAsync(1));

    review.accounting = { status: "settled", reserved_usd: null, charged_usd: "0.04" };
    await act(async () => vi.advanceTimersByTimeAsync(30_001));
    expect(screen.getByText("Provider cost USD 0.04")).toBeTruthy();
    const reads = vi.mocked(aiChatApi.getMandateReview).mock.calls.length;
    await act(async () => vi.advanceTimersByTimeAsync(60_000));
    expect(aiChatApi.getMandateReview).toHaveBeenCalledTimes(reads);
  } finally {
    vi.useRealTimers();
  }

  review.work_status = "failed";
  review.requires_reconciliation = true;
  await act(() => client.invalidateQueries({
    queryKey: ["chat-mandate-reviews", "workspace", "thread", "work"],
  }));
  expect((await screen.findByRole("alert")).textContent).toContain("reconcile the request");
  expect(screen.queryByRole("button", { name: "Run" })).toBeNull();
});


it("submits Entry links and user limits without model credentials", async () => {
  vi.clearAllMocks();
  vi.mocked(aiChatApi.listMandateReviews).mockResolvedValue({ can_propose: true, reviews: [] });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MandateReviews threadId="thread" workspaceId="workspace" />
    </QueryClientProvider>,
  );
  fireEvent.click(await screen.findByText("Mandate reviews (0)"));
  fireEvent.click(screen.getByText("Propose an Entry-read mandate"));
  fireEvent.change(screen.getByLabelText("Goal"), { target: { value: "Summarize the notes" } });
  fireEvent.change(screen.getByLabelText("Entry links or IDs, one per line"), {
    target: { value: "/tracks/n.Track.test?entry=n.Entry.one\nn.Entry.two" },
  });
  fireEvent.change(screen.getByLabelText("Maximum spend in USD"), { target: { value: "0.25" } });
  fireEvent.click(screen.getByRole("button", { name: "Save proposal for review" }));
  await waitFor(() => expect(aiChatApi.proposeEntryReadMandate).toHaveBeenCalledOnce());
  const [thread, proposal] = vi.mocked(aiChatApi.proposeEntryReadMandate).mock.calls[0];
  expect(thread).toBe("thread");
  expect(proposal).toEqual({
    mandate_id: expect.any(String),
    goal: "Summarize the notes",
    entry_ids: ["n.Entry.one", "n.Entry.two"],
    max_spend: "0.25",
    deadline_at: expect.any(String),
  });
});
