export function hasAssistantDebugPayload(custom: unknown): boolean {
  return Boolean(
    custom &&
      typeof custom === "object" &&
      (custom as { finalPayload?: unknown }).finalPayload &&
      typeof (custom as { finalPayload?: unknown }).finalPayload === "object",
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** Compact request diagnostics without changing stored messages or API inputs.
 * Only known optional context placeholders are omitted: null costs, false
 * permission flags, empty results, and unknown extension fields are evidence.
 */
export function compactMessageDebugPayload(
  payload: Record<string, unknown>,
): Record<string, unknown> {
  if (!isRecord(payload.request)) return payload;
  const request = { ...payload.request };
  for (const key of ["session_id", "focused_view_id", "focused_space_id", "focused_track_id"]) {
    if (request[key] == null || request[key] === "") delete request[key];
  }
  if (isRecord(request.page_context)) {
    const page = { ...request.page_context };
    for (const [requestKey, pageKey] of [
      ["focused_view_id", "focused_view_id"],
      ["focused_space_id", "focused_app_id"],
      ["focused_track_id", "focused_track_id"],
    ]) {
      if (page[pageKey] == null || page[pageKey] === "") delete page[pageKey];
      if (request[requestKey] !== undefined && request[requestKey] === page[pageKey]) {
        delete request[requestKey];
      }
    }
    request.page_context = page;
  }
  return { ...payload, request };
}


/** Present the retired host fallback plainly, without rewriting user text,
 * arbitrary AI answers, saved history, or the original debug payload. */
export function friendlyAssistantText(text: string): string {
  const legacy = "I couldn't verify a complete answer from the available results. I stopped further tool use for this turn. We can continue in this chat using the results already obtained.";
  return text.trim() === legacy
    ? "I ran into a problem and couldn't finish your request. Before trying again, check this chat for any changes awaiting your approval and review anything already saved. You can ask me to pick up where we left off."
    : text;
}


/** Failure details remain available in Message debug; ordinary chat uses
 * stable, actionable wording even for legacy JSON-encoded results. */
export function friendlyToolFailure(value: unknown): string {
  let parsed = value;
  if (typeof value === "string") {
    try { parsed = JSON.parse(value); } catch { /* Not a structured failure. */ }
  }
  const code = isRecord(parsed) ? parsed.error_code ?? parsed.code : undefined;
  const messages: Record<string, string> = {
    invalid_arguments: "I couldn't prepare this step correctly.",
    scaffold_plan_validation_failed: "I couldn't prepare the setup correctly. No changes from this attempt were saved.",
    plan_differs_from_design: "I need to correct this step to match the setup you approved.",
    permission_denied: "I couldn't access something needed for this request. You may need help from your workspace administrator.",
    policy_denied: "Your current permissions don't allow this action. Ask your workspace administrator if you need access.",
    internal_error: "Something went wrong while I was working on this step.",
  };
  return typeof code === "string" && Object.prototype.hasOwnProperty.call(messages, code)
    ? messages[code]
    : "I couldn't finish this step. Check anything already saved before trying again.";
}


export function friendlyChatFailure(code: unknown, message: unknown): string {
  if (code === "work.cancelled") return "You stopped this request.";
  if (code === "work.deadline_exceeded") {
    return "This request took too long to finish. Check anything already saved, then ask me to continue.";
  }
  if (code === "turn.interrupted" || (typeof code === "string" && code.startsWith("work."))) {
    return "I couldn't finish this request. Some changes may already be saved; check those before trying again.";
  }
  return typeof message === "string" && message.trim()
    ? message.trim()
    : "I couldn't finish this step. Please try again.";
}
