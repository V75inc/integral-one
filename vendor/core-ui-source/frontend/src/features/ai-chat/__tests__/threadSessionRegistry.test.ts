import { describe, expect, it } from "vitest";

import {
  addStreamingThreadId,
  createEmptySession,
  evictIdleSessions,
  MAX_CACHED_THREAD_SESSIONS,
  removeStreamingThreadId,
} from "../threadSessionRegistry";

describe("threadSessionRegistry", () => {
  it("createEmptySession returns idle defaults", () => {
    const session = createEmptySession();
    expect(session.messages).toEqual([]);
    expect(session.streaming).toBe(false);
    expect(session.abortController).toBeNull();
  });

  it("tracks multiple streaming thread ids", () => {
    let ids: string[] = [];
    ids = addStreamingThreadId(ids, "a");
    ids = addStreamingThreadId(ids, "b");
    expect(ids).toEqual(["a", "b"]);
    ids = removeStreamingThreadId(ids, "a");
    expect(ids).toEqual(["b"]);
  });

  it("evicts oldest idle sessions beyond cache cap", () => {
    const sessions: Record<string, ReturnType<typeof createEmptySession>> = {};
    for (let i = 0; i < MAX_CACHED_THREAD_SESSIONS + 3; i++) {
      sessions[`t${i}`] = {
        ...createEmptySession(),
        lastLoadedAt: i,
      };
    }
    const next = evictIdleSessions(sessions, [], "t99");
    expect(Object.keys(next).length).toBeLessThanOrEqual(
      MAX_CACHED_THREAD_SESSIONS,
    );
    expect(next["t99"]).toBeUndefined();
    expect(next[`t${MAX_CACHED_THREAD_SESSIONS + 2}`]).toBeDefined();
  });

  it("does not evict streaming sessions", () => {
    const sessions = {
      old: { ...createEmptySession(), lastLoadedAt: 1 },
      streaming: { ...createEmptySession(), lastLoadedAt: 2, streaming: true },
    };
    const next = evictIdleSessions(sessions, ["streaming"], null);
    expect(next.streaming).toBeDefined();
  });
});
