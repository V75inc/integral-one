import { describe, expect, it } from "vitest";
import { friendlyAssistantText, friendlyChatFailure, friendlyToolFailure } from "../assistantMessagePresentation";

describe("everyday chat wording", () => {
  it("updates only the exact retired host fallback", () => {
    const old = "I couldn't verify a complete answer from the available results. I stopped further tool use for this turn. We can continue in this chat using the results already obtained.";
    expect(friendlyAssistantText(old)).toContain("couldn't finish your request");
    expect(friendlyAssistantText(old)).toContain("approval");
    expect(friendlyAssistantText("Quote: " + old)).toBe("Quote: " + old);
    expect(friendlyAssistantText("Your changes are ready for approval.")).toBe("Your changes are ready for approval.");
  });
  it("uses fixed explanations for known failures without echoing private errors", () => {
    expect(friendlyToolFailure({ error_code: "invalid_arguments", message: "secret" })).toBe("I couldn't prepare this step correctly.");
    expect(friendlyToolFailure({ error_code: "private-code", message: "secret" })).not.toContain("secret");
    expect(friendlyToolFailure("provider stack trace")).not.toContain("stack trace");
  });
});


it("explains stopped and interrupted requests without internal worker details", () => {
  expect(friendlyChatFailure("work.cancelled", "Turn stopped.")).toBe("You stopped this request.");
  expect(friendlyChatFailure("work.lease_lost", "private lease details")).not.toContain("lease");
  expect(friendlyChatFailure("work.deadline_exceeded", "private timeout")).toContain("ask me to continue");
  expect(friendlyChatFailure("internal_error", "Please try again.")).toBe("Please try again.");
});

it('gives actionable image limits and reattachment guidance without inventing an enable switch', () => {
  expect(friendlyChatFailure('image_input_unsupported', 'private')).toContain('PNG');
  expect(friendlyChatFailure('image_input_invalid', 'private')).toContain('attach');
  expect(friendlyChatFailure('image_input_limit', 'private')).toContain('four');
});
