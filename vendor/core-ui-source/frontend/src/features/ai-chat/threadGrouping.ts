import { differenceInCalendarDays, format } from "date-fns";

export interface ThreadGroupInfo {
  /** Human bucket label, e.g. "Today", "Previous 7 days", "March 2026". */
  label: string;
  /** True when this thread is the FIRST of its bucket in render order —
   *  the row that should render the group header above it. */
  isFirst: boolean;
}

export interface OrderedThread {
  id: string;
  /** Epoch ms of the thread's most recent activity, or null when unknown
   *  (brand-new thread with no messages yet). */
  ts: number | null;
}

/**
 * Bucket an ORDERED (recent-first) list of threads into recency groups.
 *
 * The caller passes threads already in the order they render (the chat
 * runtime lists them by ``last_message_at`` descending). This returns a map
 * of ``id → {label, isFirst}`` so each row can render its bucket header when
 * it is the first row of a new bucket — no re-sorting, no separate list.
 *
 * ``now`` is injected (not read from the clock) so the function is pure and
 * unit-testable across day boundaries.
 */
export function groupThreadsByRecency(
  ordered: readonly OrderedThread[],
  now: number,
): Map<string, ThreadGroupInfo> {
  const out = new Map<string, ThreadGroupInfo>();
  let prevLabel: string | null = null;
  for (const { id, ts } of ordered) {
    const label = bucketLabel(ts, now);
    out.set(id, { label, isFirst: label !== prevLabel });
    prevLabel = label;
  }
  return out;
}

function bucketLabel(ts: number | null, now: number): string {
  // No activity yet (just created) — group with the freshest bucket.
  if (ts == null || Number.isNaN(ts)) return "Today";
  // Calendar-day difference so "yesterday 11pm" reads as 1 day, not 0.
  // Future timestamps (clock skew) fall through to "Today".
  const days = differenceInCalendarDays(now, ts);
  if (days <= 1) {
    const hour = new Date(Math.min(ts, now)).getHours();
    const period = hour < 6 ? "Overnight" : hour < 12 ? "Morning" : hour < 18 ? "Afternoon" : "Evening";
    return `${days <= 0 ? "Today" : "Yesterday"} · ${period}`;
  }
  if (days <= 7) return format(ts, "EEEE, MMM d");
  if (days <= 30) return "Previous 30 days";
  return format(ts, "MMMM yyyy");
}
