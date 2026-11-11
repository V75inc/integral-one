import { type FormEvent, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { aiChatApi, type EntryReadMandateProposal } from "../../../api/aiChat";
import { apiResponseMessage } from "../../../lib/apiResponseMessage";
import { Input, Text, Textarea } from "../../../ui";
import { randomUUID } from "../../../utils/randomUUID";

export function MandateReviews({
  threadId,
  workspaceId,
}: {
  threadId: string;
  workspaceId: string | null;
}) {
  const [open, setOpen] = useState(false);
  const listKey = ["chat-mandate-reviews", workspaceId, threadId];
  const reviews = useQuery({
    queryKey: listKey,
    queryFn: () => aiChatApi.listMandateReviews(threadId),
  });
  if (!reviews.data || (!reviews.data.can_propose && !reviews.data.reviews.length)) return null;
  const items = reviews.data.reviews;

  return (
    <details onToggle={(event) => setOpen(event.currentTarget.open)} className="rounded-[var(--radius-input)] border border-[var(--border-subtle)] p-3">
      <summary className="cursor-pointer">
        <Text as="span" variant="meta">Mandate reviews ({items.length})</Text>
      </summary>
      {reviews.data.can_propose && (
        <EntryReadProposal key={threadId} threadId={threadId} listKey={listKey} />
      )}
      <ul className="mt-2 flex flex-col gap-2">
        {items.map((review) => (
          <li key={review.work_item_id}>
            <MandateReview
              threadId={threadId}
              workItemId={review.work_item_id}
              listKey={listKey}
              panelOpen={open}
              goal={review.goal}
            />
          </li>
        ))}
      </ul>
    </details>
  );
}

function parseEntrySource(value: string): string | null {
  const id = /^n\.Entry\.[a-zA-Z0-9_-]+$/;
  if (id.test(value)) return value;
  try {
    const url = new URL(value, window.location.origin);
    if (url.origin !== window.location.origin || !url.pathname.startsWith("/tracks/")) return null;
    const entry = url.searchParams.get("entry");
    return entry && id.test(entry) ? entry : null;
  } catch {
    return null;
  }
}

function EntryReadProposal({
  threadId,
  listKey,
}: {
  threadId: string;
  listKey: (string | null)[];
}) {
  const client = useQueryClient();
  const [goal, setGoal] = useState("");
  const [sources, setSources] = useState("");
  const [spend, setSpend] = useState("");
  const [minutes, setMinutes] = useState("15");
  const [formError, setFormError] = useState("");
  const previous = useRef<{ key: string; proposal: EntryReadMandateProposal } | null>(null);
  const action = useMutation({
    mutationFn: (proposal: EntryReadMandateProposal) => aiChatApi.proposeEntryReadMandate(threadId, proposal),
    onSuccess: async () => {
      previous.current = null;
      setGoal("");
      setSources("");
      setSpend("");
      await client.invalidateQueries({ queryKey: listKey, exact: true });
    },
  });

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = sources.split(/\s+/).filter(Boolean);
    const ids = values.map(parseEntrySource);
    if (!goal.trim() || !ids.length || ids.some((id) => !id) || ids.length > 12) {
      setFormError("Enter a goal and 1 to 12 Entry IDs or links from this workspace.");
      return;
    }
    setFormError("");
    const entryIds = [...new Set(ids.filter((id): id is string => id !== null))];
    const key = JSON.stringify([goal.trim(), entryIds, spend, minutes]);
    if (previous.current?.key !== key) {
      previous.current = {
        key,
        proposal: {
          mandate_id: randomUUID(),
          goal: goal.trim(),
          entry_ids: entryIds,
          max_spend: spend,
          deadline_at: new Date(Date.now() + Number(minutes) * 60_000).toISOString(),
        },
      };
    }
    action.mutate(previous.current.proposal);
  }

  return (
    <details className="mt-2">
      <summary className="cursor-pointer">
        <Text as="span" variant="meta">Propose an Entry-read mandate</Text>
      </summary>
      <form className="mt-2 flex flex-col gap-2" onSubmit={submit}>
        <Text as="p" variant="meta">Integral reads the reviewed Entry titles and bodies and saves a private answer here. Review the proposal before approving or running it.</Text>
        <label>
          <Text as="span" variant="meta">Goal</Text>
          <Textarea required maxLength={4000} value={goal} onChange={(event) => setGoal(event.target.value)} />
        </label>
        <label>
          <Text as="span" variant="meta">Entry links or IDs, one per line</Text>
          <Textarea required maxLength={4096} value={sources} onChange={(event) => setSources(event.target.value)} />
        </label>
        <label>
          <Text as="span" variant="meta">Maximum spend in USD</Text>
          <Input required type="number" min="0" step="0.01" value={spend} onChange={(event) => setSpend(event.target.value)} />
        </label>
        <label>
          <Text as="span" variant="meta">Minutes until deadline</Text>
          <Input required type="number" min="1" max="1440" step="1" value={minutes} onChange={(event) => setMinutes(event.target.value)} />
        </label>
        <button type="submit" className="self-start underline disabled:opacity-50" disabled={action.isPending}>
          <Text as="span" variant="meta">{action.isPending ? "Saving proposal…" : "Save proposal for review"}</Text>
        </button>
        {(formError || action.isError) && (
          <div role="alert">
            <Text as="p" variant="meta">
              {formError || apiResponseMessage(action.error, "Could not save the mandate proposal.")}
            </Text>
          </div>
        )}
        {action.isSuccess && (
          <div role="status"><Text as="p" variant="meta">Proposal saved. Open it below to review the exact terms.</Text></div>
        )}
      </form>
    </details>
  );
}

function MandateReview({
  threadId,
  workItemId,
  listKey,
  panelOpen,
  goal,
}: {
  threadId: string;
  workItemId: string;
  listKey: (string | null)[];
  panelOpen: boolean;
  goal: string;
}) {
  const [open, setOpen] = useState(false);
  const client = useQueryClient();
  const key = [...listKey, workItemId];
  const review = useQuery({
    queryKey: key,
    queryFn: () => aiChatApi.getMandateReview(threadId, workItemId),
    enabled: open && panelOpen,
    refetchInterval: ({ state }) => {
      if (!open || !panelOpen) return false;
      const data = state.data;
      if (data?.work_status === "queued" || data?.work_status === "running") return 3_000;
      const accounting = data?.accounting?.status;
      return accounting === "reserved" || accounting === "awaiting_receipt" ? 30_000 : false;
    },
  });
  const action = useMutation({
    mutationFn: ({ name, digest }: { name: "approve" | "reject" | "run" | "stop"; digest: string }) =>
      aiChatApi.actOnMandateReview(threadId, workItemId, name, digest),
    onSettled: async () => {
      await Promise.all([
        client.invalidateQueries({ queryKey: key, exact: true }),
        client.invalidateQueries({ queryKey: listKey, exact: true }),
      ]);
    },
  });

  const data = review.data;
  const terms = data?.terms;
  const ready = data?.entry_read_preflight === "current" && data.model_route_preflight === "current";
  const pending = data?.approval_status === "pending" && data.work_status === "waiting_for_human";
  const approved = data?.approval_status === "approved" && data.work_status === "waiting_for_human";
  const stoppable = data?.work_status === "queued" || data?.work_status === "running";

  return (
    <details onToggle={(event) => setOpen(event.currentTarget.open)} className="rounded-[var(--radius-input)] border border-[var(--border-subtle)] p-2">
      <summary className="cursor-pointer break-words">
        <Text as="span" variant="meta">{goal}</Text>
      </summary>
      {open && review.isPending && <Text as="p" variant="meta">Loading review…</Text>}
      {open && review.isError && (
        <div role="alert">
          <Text as="p" variant="meta">
            {apiResponseMessage(review.error, "Could not load the mandate review.")}
          </Text>
        </div>
      )}
      {open && data && terms && (
        <div className="mt-2 flex flex-col gap-2 break-words">
          <div role="status">
            <Text as="p" variant="meta">
              Revision {terms.revision} · {data.approval_status} · {approved ? "Awaiting execution" : data.work_status.replace(/_/g, " ")}
            </Text>
            {stoppable && data.cancel_requested && (
              <Text as="p" variant="meta">Stop requested</Text>
            )}
          </div>
          {data.accounting?.status === "awaiting_receipt" && (
            <Text as="p" variant="meta">
              Provider cost is unconfirmed. The reservation remains open
              {data.accounting.reserved_usd != null ? ` (USD ${data.accounting.reserved_usd})` : ""}.
            </Text>
          )}
          {data.accounting?.status === "reserved" && data.accounting.reserved_usd != null && (
            <Text as="p" variant="meta">Reserved USD {data.accounting.reserved_usd}</Text>
          )}
          {(data.accounting?.status === "settled" || data.accounting?.status === "overrun") && (
            <Text as="p" variant="meta">
              {data.accounting.charged_usd != null
                ? `Provider cost USD ${data.accounting.charged_usd}`
                : "Provider cost unavailable"}
              {data.accounting.status === "overrun" ? " · Above reserved amount" : ""}
            </Text>
          )}
          {data.accounting?.status === "released" && (
            <Text as="p" variant="meta">Reservation released</Text>
          )}
          {data.requires_reconciliation && (
            <div role="alert">
              <Text as="p" variant="meta">
                The model request may have completed before the run was interrupted. Ask your operator to reconcile the request before starting this work again.
              </Text>
            </div>
          )}
          <Text as="p" variant="meta">
            Spend ceiling {terms.limits.currency} {terms.limits.max_spend} · {terms.limits.max_model_requests} model requests · {terms.limits.max_tool_calls} tool calls · {terms.limits.max_internal_writes} writes · {terms.limits.max_external_effects} external effects
          </Text>
          <Text as="p" variant="meta">Deadline {new Date(terms.limits.deadline_at).toLocaleString()}</Text>
          <Text as="p" variant="meta">Entry access {data.entry_read_preflight} · Model route {data.model_route_preflight}</Text>
          <ReviewLines label="Models" items={terms.model_routes.map((route) => `${route.provider} / ${route.model} (${route.credential_source})`)} />
          <ReviewLines label="Grants" items={terms.grants.map((grant) => `${grant.capability_key} v${grant.capability_version} · ${grant.operation} · up to ${grant.max_calls} calls · ${grant.resources.map((resource) => `${resource.kind} ${resource.resource_id}`).join(", ")}`)} />
          <ReviewLines label="External destinations" items={terms.external_grants.map((grant) => `${grant.capability_key} · ${grant.destination} · up to ${grant.max_effects} effects`)} />
          <ReviewLines label="Pinned sources" items={(terms.entry_source_revisions ?? []).map((source) => `${source.entry_id} · revision ${source.record_revision}`)} />
          <ReviewLines label="Success criteria" items={terms.success_criteria} />
          <ReviewLines label="Stop conditions" items={terms.stop_conditions} />
          <ReviewLines label="Result obligations" items={terms.result_obligations} />
          <div className="flex flex-wrap gap-3">
            {pending && (
              <>
                <button type="button" className="underline disabled:opacity-50" disabled={!ready || action.isPending} onClick={() => action.mutate({ name: "approve", digest: data.review_digest })}>
                  <Text as="span" variant="meta">Approve</Text>
                </button>
                <button type="button" className="underline disabled:opacity-50" disabled={action.isPending} onClick={() => action.mutate({ name: "reject", digest: data.review_digest })}>
                  <Text as="span" variant="meta">Reject</Text>
                </button>
              </>
            )}
            {approved && data.execution_enabled && (
              <button type="button" className="underline disabled:opacity-50" disabled={!ready || action.isPending} onClick={() => action.mutate({ name: "run", digest: data.review_digest })}>
                <Text as="span" variant="meta">Run</Text>
              </button>
            )}
            {stoppable && !data.cancel_requested && (
              <button type="button" className="underline disabled:opacity-50" disabled={action.isPending} onClick={() => action.mutate({ name: "stop", digest: data.review_digest })}>
                <Text as="span" variant="meta">Stop</Text>
              </button>
            )}
            {approved && !data.execution_enabled && <Text as="p" variant="meta">Execution is disabled on this deployment.</Text>}
          </div>
          {action.isError && (
            <div role="alert">
              <Text as="p" variant="meta">
                {apiResponseMessage(action.error, "Could not update the mandate review.")}
              </Text>
            </div>
          )}
        </div>
      )}
    </details>
  );
}

function ReviewLines({ label, items }: { label: string; items: string[] }) {
  if (!items.length) return null;
  return (
    <div>
      <Text as="p" variant="meta" weight="medium">{label}</Text>
      <ul className="list-disc pl-4">
        {items.map((item, index) => (
          <li key={index}><Text as="span" variant="meta">{item}</Text></li>
        ))}
      </ul>
    </div>
  );
}
