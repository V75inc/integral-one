/**
 * Which workspaces are working right now.
 *
 * The switcher is the only place that can answer "your other workspace is
 * still busy". Without it, a turn started in workspace A becomes invisible the
 * moment the user looks at B — the thread spinner lives inside the chat
 * surface for A, which is no longer on screen.
 *
 * Two sources have to merge: streams this tab owns (`streamingThreadIds` plus
 * the owning session's workspace) and turns it does not (`remoteTurns`, which
 * carries its own workspace because there is no local session to look it up
 * from).
 *
 * The identity assertion is not a nicety. The hook derives a Set, and a Set
 * built fresh on every render is a new reference — returned straight out of
 * `useSyncExternalStore` that is an infinite render loop, and in a dependency
 * array it re-fires every effect downstream.
 */

import { describe, expect, it, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

import {
  __resetThreadSessionStoreForTests,
  markRemoteTurnStarted,
  markRemoteTurnFinished,
  markThreadStreaming,
  unmarkThreadStreaming,
  updateThreadSession,
} from "../threadSessionStore";
import { useWorkspacesWithRunningTurns } from "../hooks/useWorkspacesWithRunningTurns";

beforeEach(() => {
  __resetThreadSessionStoreForTests();
});

describe("useWorkspacesWithRunningTurns", () => {
  it("is empty when nothing is running", () => {
    const { result } = renderHook(() => useWorkspacesWithRunningTurns());
    expect([...result.current]).toEqual([]);
  });

  it("reports the workspace of a stream this tab owns", () => {
    const { result } = renderHook(() => useWorkspacesWithRunningTurns());

    act(() => {
      updateThreadSession("t1", (s) => ({ ...s, workspaceId: "ws1" }));
      markThreadStreaming("t1");
    });

    expect([...result.current]).toEqual(["ws1"]);
  });

  it("reports the workspace of a turn started elsewhere", () => {
    // A routine, or the same account in another window. There is no local
    // session for it, which is why remoteTurns carries the workspace itself.
    const { result } = renderHook(() => useWorkspacesWithRunningTurns());

    act(() => {
      markRemoteTurnStarted("t9", "ws2", "turn-1");
    });

    expect([...result.current]).toEqual(["ws2"]);
  });

  it("merges both sources without duplicating a workspace", () => {
    const { result } = renderHook(() => useWorkspacesWithRunningTurns());

    act(() => {
      updateThreadSession("t1", (s) => ({ ...s, workspaceId: "ws1" }));
      markThreadStreaming("t1");
      markRemoteTurnStarted("t2", "ws1", "turn-1");
      markRemoteTurnStarted("t3", "ws2", "turn-2");
    });

    expect([...result.current].sort()).toEqual(["ws1", "ws2"]);
  });

  it("drops a workspace once its last turn finishes", () => {
    const { result } = renderHook(() => useWorkspacesWithRunningTurns());

    act(() => {
      updateThreadSession("t1", (s) => ({ ...s, workspaceId: "ws1" }));
      markThreadStreaming("t1");
      markRemoteTurnStarted("t2", "ws1", "turn-1");
    });
    expect([...result.current]).toEqual(["ws1"]);

    // One source going quiet is not enough — the other still holds ws1.
    act(() => {
      unmarkThreadStreaming("t1");
    });
    expect([...result.current]).toEqual(["ws1"]);

    act(() => {
      markRemoteTurnFinished("t2", "turn-1");
    });
    expect([...result.current]).toEqual([]);
  });

  it("ignores a streaming thread whose workspace is not known yet", () => {
    // A locally-allocated thread before its first send has workspaceId null.
    // Attributing it to the active workspace would light the wrong row.
    const { result } = renderHook(() => useWorkspacesWithRunningTurns());

    act(() => {
      markThreadStreaming("local-1");
    });

    expect([...result.current]).toEqual([]);
  });

  it("keeps a stable reference when nothing changed", () => {
    const { result, rerender } = renderHook(() =>
      useWorkspacesWithRunningTurns(),
    );

    act(() => {
      markRemoteTurnStarted("t1", "ws1", "turn-1");
    });
    const first = result.current;

    rerender();
    expect(result.current).toBe(first);
  });
});
