/**
 * Turns this tab did not start.
 *
 * The WS handler used to drop every event that was not `completed`, and to
 * drop `completed` for any thread it had not already cached — which, after a
 * workspace switch wiped the cache, was every thread. A routine's turn was
 * therefore invisible: the row read idle while the agent worked on it.
 *
 * `turn_id` exists for the ordering hazard: a fast completed-then-started
 * pair, or a late `completed` arriving after a newer turn has begun, must not
 * clear the newer one.
 */

import { describe, expect, it, beforeEach } from "vitest";

import {
  __resetThreadSessionStoreForTests,
  getRemoteTurnsSnapshot,
  markRemoteTurnFinished,
  markRemoteTurnStarted,
} from "../threadSessionStore";

beforeEach(() => {
  __resetThreadSessionStoreForTests();
});

describe("remote turn tracking", () => {
  it("records a turn started elsewhere, with its workspace", () => {
    markRemoteTurnStarted("t1", "ws1", "turn-1");
    expect(getRemoteTurnsSnapshot()).toEqual({
      t1: { workspaceId: "ws1", turnId: "turn-1" },
    });
  });

  it("clears on completion", () => {
    markRemoteTurnStarted("t1", "ws1", "turn-1");
    markRemoteTurnFinished("t1", "turn-1");
    expect(getRemoteTurnsSnapshot()).toEqual({});
  });

  it("ignores a late completion for a superseded turn", () => {
    // turn-1 finishes, turn-2 starts, and turn-1's `completed` arrives after.
    // Clearing on it would show the thread idle while turn-2 is running.
    markRemoteTurnStarted("t1", "ws1", "turn-1");
    markRemoteTurnStarted("t1", "ws1", "turn-2");
    markRemoteTurnFinished("t1", "turn-1");
    expect(getRemoteTurnsSnapshot()).toEqual({
      t1: { workspaceId: "ws1", turnId: "turn-2" },
    });
  });

  it("still clears when the server sent no turn id", () => {
    // Older payloads, and any path that does not carry one — a missing id
    // must not strand the badge on forever.
    markRemoteTurnStarted("t1", "ws1", null);
    markRemoteTurnFinished("t1", null);
    expect(getRemoteTurnsSnapshot()).toEqual({});
  });

  it("tracks several threads independently", () => {
    markRemoteTurnStarted("t1", "ws1", "a");
    markRemoteTurnStarted("t2", "ws2", "b");
    markRemoteTurnFinished("t1", "a");
    expect(getRemoteTurnsSnapshot()).toEqual({
      t2: { workspaceId: "ws2", turnId: "b" },
    });
  });

  it("is a no-op when completion arrives for an untracked thread", () => {
    markRemoteTurnFinished("never-seen", "x");
    expect(getRemoteTurnsSnapshot()).toEqual({});
  });
});
