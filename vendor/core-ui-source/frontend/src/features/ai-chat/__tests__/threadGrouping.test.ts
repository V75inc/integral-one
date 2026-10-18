import { describe, expect, it } from "vitest";

import { groupThreadsByRecency } from "../threadGrouping";

const DAY = 24 * 60 * 60 * 1000;
// Fixed "now": 2026-03-20T12:00:00 local. Use a mid-day anchor so calendar-day
// math is stable regardless of the runner's timezone.
const NOW = new Date(2026, 2, 20, 12, 0, 0).getTime();

function at(daysAgo: number, hour = 10): number {
  const d = new Date(2026, 2, 20, hour, 0, 0);
  d.setDate(d.getDate() - daysAgo);
  return d.getTime();
}

describe("groupThreadsByRecency", () => {
  it("buckets by recency and flags the first row of each bucket", () => {
    const ordered = [
      { id: "a", ts: at(0) }, // Today
      { id: "b", ts: at(0, 8) }, // Today
      { id: "c", ts: at(1) }, // Yesterday
      { id: "d", ts: at(4) }, // Previous 7 days
      { id: "e", ts: at(20) }, // Previous 30 days
      { id: "f", ts: at(90) }, // month bucket
    ];
    const g = groupThreadsByRecency(ordered, NOW);

    expect(g.get("a")).toEqual({ label: "Today · Morning", isFirst: true });
    expect(g.get("b")).toEqual({ label: "Today · Morning", isFirst: false });
    expect(g.get("c")).toEqual({ label: "Yesterday · Morning", isFirst: true });
    expect(g.get("d")).toEqual({ label: "Monday, Mar 16", isFirst: true });
    expect(g.get("e")).toEqual({ label: "Previous 30 days", isFirst: true });
    // 90 days before 2026-03-20 → 2025-12-20.
    expect(g.get("f")).toEqual({ label: "December 2025", isFirst: true });
  });

  it("treats null / unknown timestamps as Today", () => {
    const g = groupThreadsByRecency([{ id: "x", ts: null }], NOW);
    expect(g.get("x")).toEqual({ label: "Today", isFirst: true });
  });

  it("treats future timestamps (clock skew) as Today", () => {
    const g = groupThreadsByRecency([{ id: "x", ts: NOW + 2 * DAY }], NOW);
    expect(g.get("x")?.label).toBe("Today · Afternoon");
  });

  it("separate months get distinct buckets, each first-flagged", () => {
    const g = groupThreadsByRecency(
      [
        { id: "m1", ts: at(45) }, // Feb 2026
        { id: "m2", ts: at(75) }, // Jan 2026
      ],
      NOW,
    );
    expect(g.get("m1")).toEqual({ label: "February 2026", isFirst: true });
    expect(g.get("m2")).toEqual({ label: "January 2026", isFirst: true });
  });

  it("splits a busy day into local time periods", () => {
    const g = groupThreadsByRecency([
      { id: "evening", ts: at(0, 20) },
      { id: "afternoon", ts: at(0, 14) },
      { id: "morning", ts: at(0, 9) },
      { id: "night", ts: at(0, 2) },
    ], at(0, 22));
    expect([...g.values()].map(v => v.label)).toEqual([
      "Today · Evening", "Today · Afternoon", "Today · Morning", "Today · Overnight",
    ]);
  });

  it("returns an empty map for no threads", () => {
    expect(groupThreadsByRecency([], NOW).size).toBe(0);
  });
});
