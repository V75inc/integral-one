/**
 * Image attachment adapter for the AI chat composer (Slice A — vision).
 *
 * Accepts common image types, converts the picked File to a base64 data URL,
 * and emits an assistant-ui image message part. The runtime
 * (``useAIChatRuntime``) extracts these parts and forwards them to the backend
 * as ``images[]`` on the turn, where they become the vision reflex's
 * ``image_urls``. The runtime uses createImageAttachmentAdapter to also
 * upload the original and retain a real attachment identity for filing.
 */
import type {
  AttachmentAdapter,
  CompleteAttachment,
  PendingAttachment,
} from "@assistant-ui/react";
import { createFileAttachmentAdapter } from "./fileAttachmentAdapter";

export const ACCEPTED_IMAGE_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
];

/** ~5 MB — matches the backend per-image cap. */
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

function readAsDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error("file read failed"));
    reader.readAsDataURL(file);
  });
}

export const imageAttachmentAdapter: AttachmentAdapter = {
  accept: ACCEPTED_IMAGE_TYPES.join(","),

  async add({ file }: { file: File }): Promise<PendingAttachment> {
    if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) {
      throw new Error(
        `Unsupported image type: ${file.type || "unknown"}. ` +
          `Allowed: PNG, JPEG, WebP, GIF.`,
      );
    }
    if (file.size > MAX_IMAGE_BYTES) {
      throw new Error(`Image too large (max 5 MB): ${file.name}`);
    }
    return {
      id:
        globalThis.crypto?.randomUUID?.() ??
        `att-${Date.now()}-${Math.round(Math.random() * 1e6)}`,
      type: "image",
      name: file.name,
      contentType: file.type,
      file,
      status: { type: "requires-action", reason: "composer-send" },
    };
  },

  async send(attachment: PendingAttachment): Promise<CompleteAttachment> {
    const dataUrl = await readAsDataURL(attachment.file);
    return {
      ...attachment,
      status: { type: "complete" },
      content: [
        {
          type: "image",
          image: dataUrl,
        },
      ],
    };
  },

  async remove(): Promise<void> {
    // Nothing to clean up — no server-side upload in this slice.
  },
};

/** Keep vision input and filing identity on the same persisted chat upload. */
export function createImageAttachmentAdapter(
  ensureThreadId: () => Promise<string>,
): AttachmentAdapter {
  const files = createFileAttachmentAdapter(ensureThreadId);
  return {
    ...imageAttachmentAdapter,
    async send(attachment: PendingAttachment): Promise<CompleteAttachment> {
      const [vision, stored] = await Promise.all([
        imageAttachmentAdapter.send(attachment),
        files.send(attachment),
      ]);
      return {
        ...vision,
        content: [...vision.content, ...stored.content],
      };
    },
  };
}
