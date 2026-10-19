/**
 * Helpers for rendering staged-change approval ("bless") cards.
 *
 * Division of responsibilities:
 *   - The raw tool-call TRACE (tool name, args, result) stays inside the
 *     collapsible "N tool calls" group, rendered by the default
 *     ``ToolFallback`` disclosure in ``Thread.tsx``. We deliberately register
 *     NO per-tool renderer here, so staging ``propose`` tool calls keep that
 *     foldable technical trace.
 *   - The actionable approval CARD renders ONCE, inline at the top level of the
 *     assistant message, by ``InlineStagedCards`` in ``Thread.tsx`` — so it
 *     emanates from the chat rather than being buried in the tool group.
 *
 * This module exports the two helpers that inline path uses:
 *   - ``coerceToolResult`` — parse the (JSON-stringified) tool result into an
 *     object so the ``isStagedChange`` shape guard can run.
 *   - ``pickCardForKind`` — choose the kind-appropriate card component.
 *
 * Each card subscribes to the ``integral:staging-state-changed`` window
 * CustomEvent (dispatched by ``useAgentiveWebSocket``) so it transitions to
 * consumed / revoked / expired without waiting on the next chat turn. See
 * ``StagedChangeCard.tsx``.
 */

import { type ComponentType } from "react";
import { StagedChangeCard } from "./StagedChangeCard";
import { ProfileRevisionCard } from "./ProfileRevisionCard";
import { PublishDraftCard } from "./PublishDraftCard";
import { DiscardDraftCard } from "./DiscardDraftCard";
import { type StagedChange } from "./types";

/**
 * Pick the right card component based on ``staged.kind``. New kinds register
 * their card here; default falls back to ``StagedChangeCard``.
 */
export function pickCardForKind(
  staged: StagedChange,
): ComponentType<{ staged: StagedChange; onTerminal?: (token: string) => void }> {
  switch (staged.kind) {
    case "propose_profile_revision":
    case "apply_to_draft":
      return ProfileRevisionCard;
    case "publish_profile_draft":
      return PublishDraftCard;
    case "discard_profile_draft":
      return DiscardDraftCard;
    default:
      return StagedChangeCard;
  }
}

/**
 * Coerce the tool-call ``result`` into a plain object suitable for
 * the ``isStagedChange`` shape check.
 *
 * native provider's ``ToolExecutor`` JSON-stringifies any non-string return
 * value before storing it on ``ToolResult.content`` (see
 * ``native provider/tooling/tool_executor.py:189``), so what arrives here
 * is typically a JSON string like ``'{"_kind":"staged_change",...}'``
 * — not the dict itself. This helper parses that back to an object
 * and is also tolerant of the case where the value is already an
 * object (in case future emission paths skip the stringify step).
 *
 * Returns null on anything we can't make sense of.
 */
export function coerceToolResult(
  result: unknown,
): Record<string, unknown> | null {
  if (result == null) return null;
  if (typeof result === "object") return result as Record<string, unknown>;
  if (typeof result === "string") {
    const s = result.trim();
    if (!s) return null;
    try {
      const parsed = JSON.parse(s);
      if (parsed && typeof parsed === "object") {
        return parsed as Record<string, unknown>;
      }
    } catch {
      // Not JSON — could be a Python-style repr. The fix would be on the
      // emission side (json.dumps, not str()). Returning null just means the
      // inline card doesn't render for this part, which is safe.
      return null;
    }
  }
  return null;
}
