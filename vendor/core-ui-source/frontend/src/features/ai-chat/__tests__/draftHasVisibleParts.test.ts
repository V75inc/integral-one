import { describe, expect, it } from "vitest";

import { draftHasVisibleParts } from "../useAIChatRuntime";

function emptyDraft() {
  return {
    id: "a1",
    textParts: [] as string[],
    reasoningSegments: new Map<string, string>(),
    reasoningOrder: [] as string[],
    toolCalls: new Map(),
    toolCallOrder: [] as string[],
    sources: [] as Array<{ type: "url" | "graph"; ref: string; title?: string }>,
  };
}

describe("draftHasVisibleParts", () => {
  it("is false for empty drafts", () => {
    expect(draftHasVisibleParts(emptyDraft())).toBe(false);
  });

  it("is true for text, tools, reasoning, or sources", () => {
    expect(draftHasVisibleParts({ ...emptyDraft(), textParts: ["hi"] })).toBe(
      true,
    );
    expect(
      draftHasVisibleParts({ ...emptyDraft(), toolCallOrder: ["t1"] }),
    ).toBe(true);
    const withReason = emptyDraft();
    withReason.reasoningOrder.push("r1");
    withReason.reasoningSegments.set("r1", "thinking");
    expect(draftHasVisibleParts(withReason)).toBe(true);
    expect(
      draftHasVisibleParts({
        ...emptyDraft(),
        sources: [{ type: "url", ref: "https://x" }],
      }),
    ).toBe(true);
  });
});
