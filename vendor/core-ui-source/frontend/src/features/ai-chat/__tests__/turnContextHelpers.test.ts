import { describe, expect, it } from "vitest";
import type { ThreadMessageLike } from "@assistant-ui/react";
import { resolveEditTurn, resolveReloadTurn } from "../turnContextHelpers";

function user(id: string, text: string): ThreadMessageLike {
  return { id, role: "user", content: [{ type: "text", text }] };
}

function assistant(id: string, text: string): ThreadMessageLike {
  return { id, role: "assistant", content: [{ type: "text", text }] };
}

describe("resolveReloadTurn", () => {
  it("reloads from the user message when only one assistant bubble exists", () => {
    const messages = [
      user("u1", "File this contact"),
      assistant("a1", "On it."),
    ];
    const ctx = resolveReloadTurn(messages, "u1");
    expect(ctx?.userText).toBe("File this contact");
    expect(ctx?.priorMessages.map((m) => m.id)).toEqual(["u1"]);
  });

  it("walks back past intro assistant bubble when regenerating the answer bubble", () => {
    const messages = [
      user("u1", "File this contact"),
      assistant("a1", "On it."),
      assistant("a2", "Here is the staged proposal."),
    ];
    const ctx = resolveReloadTurn(messages, "a1");
    expect(ctx?.userText).toBe("File this contact");
    expect(ctx?.priorMessages.map((m) => m.id)).toEqual(["u1"]);
  });
});

describe("resolveEditTurn", () => {
  it("replaces the edited user row and drops later assistant bubbles", () => {
    const messages = [
      user("u1", "Old prompt"),
      assistant("a1", "On it."),
      assistant("a2", "Answer"),
    ];
    const edited = user("u2", "Revised prompt");
    const next = resolveEditTurn(messages, "u1", edited);
    expect(next?.map((m) => m.id)).toEqual(["u2"]);
  });
});
