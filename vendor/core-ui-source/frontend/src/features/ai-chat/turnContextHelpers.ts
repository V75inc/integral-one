import type { ThreadMessageLike } from "@assistant-ui/react";

function textFromMessage(msg: ThreadMessageLike | undefined): string {
  if (!msg) return "";
  const content = msg.content;
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .map((p) => ((p as { type?: string; text?: string }).type === "text"
      ? (p as { text?: string }).text
      : "") ?? "")
    .join("");
}

/**
 * Resolve the transcript slice + user prompt for assistant-ui ``onReload``.
 *
 * assistant-ui's ExternalThread passes ``parentId = messages[i - 1].id`` where
 * ``i`` is the assistant bubble being regenerated. When a turn was split across
 * multiple assistant bubbles (``message-boundary``), that predecessor is often
 * another assistant intro bubble — not the owning user message. Walk back to
 * the nearest user message and drop every assistant bubble after it.
 */
export function resolveReloadTurn(
  messages: readonly ThreadMessageLike[],
  parentId: string | null,
): { userText: string; priorMessages: ThreadMessageLike[] } | null {
  if (!parentId) return null;

  const anchorIdx = messages.findIndex((m) => m.id === parentId);
  if (anchorIdx === -1) return null;

  let userIdx = anchorIdx;
  while (userIdx >= 0 && messages[userIdx]?.role !== "user") {
    userIdx -= 1;
  }
  if (userIdx < 0) return null;

  const userText = textFromMessage(messages[userIdx]);
  if (!userText.trim()) return null;

  return {
    userText,
    priorMessages: [...messages.slice(0, userIdx + 1)],
  };
}

/**
 * Resolve the transcript slice for assistant-ui ``onEdit``.
 *
 * ``message.parentId`` is the user row being edited. Everything from that row
 * onward (including the old user text and all assistant follow-ups) is
 * replaced by the edited user message.
 */
export function resolveEditTurn(
  messages: readonly ThreadMessageLike[],
  editParentId: string | null | undefined,
  editedUserMsg: ThreadMessageLike,
): ThreadMessageLike[] | null {
  const cutIdx = editParentId
    ? messages.findIndex((m) => m.id === editParentId)
    : 0;
  if (editParentId && cutIdx === -1) return null;
  return [...messages.slice(0, cutIdx), editedUserMsg];
}
