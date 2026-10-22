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


/** Stable server codes only: ordinary provider outages are not setup prompts. */
export function isModelSetupFailure(code: unknown): boolean {
  return typeof code === "string" && [
    "model_setup_required", "model_key_required", "native_model_not_configured",
    "model_configuration_invalid", "native_model_configuration_invalid",
    "model_authentication_failed", "model_unavailable",
  ].includes(code);
}

export function modelSetupMessage(code: unknown): string {
  if (code === "model_authentication_failed") {
    return "Your AI connection needs attention. Review the connection in AI Models, then try again.";
  }
  if (code === "model_unavailable") {
    return "Your selected AI model isn't available. Choose another in AI Models, then try again.";
  }
  if (code === "model_configuration_invalid" || code === "native_model_configuration_invalid") {
    return "Review your AI model settings, then return to this chat and try again.";
  }
  return "Choose an AI model in Settings to start chatting. Once it's connected, return here and send your message again.";
}

export function friendlyChatFailure(code: unknown, message: unknown): string {
  if (isModelSetupFailure(code)) return modelSetupMessage(code);
  if (code === "work.cancelled") return "You stopped this request.";
  if (code === "image_input_unsupported") return "Attach a PNG, JPEG, WebP, or GIF image, then try again.";
  if (code === "image_input_invalid") return "This image couldn't be read. Please attach an undamaged image under 5 MB and try again.";
  if (code === "image_input_limit") return "Send up to four images per message. Remove the extra images and try again.";
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

/** Show only the error's explicit message/code, never arbitrary tool payloads. */
export function fullErrorMessage(value: unknown): string | null {
  let parsed = value;
  if (typeof value === "string") {
    try { parsed = JSON.parse(value); } catch { return value.trim() || null; }
  }
  if (typeof parsed === "string") return parsed.trim() || null;
  if (!parsed || typeof parsed !== "object") return null;
  const error = parsed as { message?: unknown; error_code?: unknown; code?: unknown };
  const message = typeof error.message === "string" ? error.message.trim() : "";
  const code = typeof (error.error_code ?? error.code) === "string"
    ? String(error.error_code ?? error.code) : "";
  return [message, code ? `Error code: ${code}` : ""].filter(Boolean).join("\n\n") || null;
}
