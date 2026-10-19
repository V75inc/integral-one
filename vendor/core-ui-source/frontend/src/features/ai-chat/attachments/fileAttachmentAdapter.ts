/**
 * General file attachment adapter for the AI chat composer (Slice B — general
 * file persistence). Shared by general files and the persisted image adapter.
 * The original file is uploaded to the chat-upload endpoint
 * (`POST /chat/threads/{id}/attachments`) at `send()` time and referenced by
 * id — the turn forwards `attachment_ids[]` so the backend builds a per-turn
 * context note (see `useAIChatRuntime`'s `attachmentIdsFromContent`).
 *
 * assistant-ui resolves every pending attachment's `send()` BEFORE calling
 * `onNew`, so on the first message of a brand-new conversation there is no
 * thread yet. `ensureThreadId` (from `useAIChatRuntime`) creates one on
 * demand in that case — the same thread `onNew` would otherwise create a
 * moment later, deduped via its own in-flight-creation guard.
 */
import type {
  AttachmentAdapter,
  CompleteAttachment,
  PendingAttachment,
} from "@assistant-ui/react";
import { attachmentsApi } from "../../../api/attachments";

/** ~500 MB matches the backend's default per-file cap (ATTACHMENT_MAX_UPLOAD_BYTES). */
export const MAX_FILE_BYTES = 500 * 1024 * 1024;

export function createFileAttachmentAdapter(
  ensureThreadId: () => Promise<string>,
): AttachmentAdapter {
  return {
    accept: "*",

    async add({ file }: { file: File }): Promise<PendingAttachment> {
      if (file.size > MAX_FILE_BYTES) {
        throw new Error(
          `File too large (max ${MAX_FILE_BYTES / (1024 * 1024)}MB): ${file.name}`,
        );
      }
      return {
        id:
          globalThis.crypto?.randomUUID?.() ??
          `att-${Date.now()}-${Math.round(Math.random() * 1e6)}`,
        type: "file",
        name: file.name,
        contentType: file.type || "application/octet-stream",
        file,
        status: { type: "requires-action", reason: "composer-send" },
      };
    },

    async send(attachment: PendingAttachment): Promise<CompleteAttachment> {
      const threadId = await ensureThreadId();
      const record = await attachmentsApi.uploadForChatThread(
        threadId,
        attachment.file,
      );
      return {
        ...attachment,
        status: { type: "complete" },
        content: [
          {
            type: "file",
            filename: record.filename,
            mimeType: record.mime_type ?? attachment.contentType ?? "",
            data: "",
            // Not part of assistant-ui's FileMessagePart type — read back by
            // `attachmentIdsFromContent` to build the turn's attachment_ids[].
            attachment_id: record.id,
          } as unknown as CompleteAttachment["content"][number],
        ],
      };
    },

    async remove(): Promise<void> {
      // The file is already persisted server-side by send() time; removing
      // the composer chip doesn't delete it (matches the image adapter,
      // which likewise does no cleanup — mirrors entry-attachment UX where
      // "remove from composer" ≠ "delete the file").
    },
  };
}
