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
