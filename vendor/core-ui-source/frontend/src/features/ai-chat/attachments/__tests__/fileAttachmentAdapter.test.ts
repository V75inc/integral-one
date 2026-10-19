import type { PendingAttachment } from "@assistant-ui/react";
import { describe, expect, it, vi } from "vitest";

const uploadForChatThread = vi.fn(async (_threadId: string, file: File) => ({
  id: "n.Attachment.abc123",
  filename: file.name,
  mime_type: file.type,
  size: file.size,
}));

vi.mock("../../../../api/attachments", () => ({
  attachmentsApi: {
    uploadForChatThread: (...args: [string, File]) =>
      uploadForChatThread(...args),
  },
}));

import { createFileAttachmentAdapter, MAX_FILE_BYTES } from "../fileAttachmentAdapter";

function makeFile(type: string, bytes = 4, name = "notes.txt"): File {
  return new File([new Uint8Array(bytes)], name, { type });
}

const existingThread = () => Promise.resolve("n.ChatThread.t1");

describe("fileAttachmentAdapter", () => {
  it("accepts any file type", () => {
    const adapter = createFileAttachmentAdapter(existingThread);
    expect(adapter.accept).toBe("*");
  });

  it("add() returns a pending file attachment", async () => {
    const adapter = createFileAttachmentAdapter(existingThread);
    const pending = (await adapter.add({
      file: makeFile("text/plain"),
    })) as PendingAttachment;
    expect(pending.type).toBe("file");
    expect(pending.status.type).toBe("requires-action");
  });

  it("add() rejects an oversize file", async () => {
    const adapter = createFileAttachmentAdapter(existingThread);
    // Avoid actually allocating MAX_FILE_BYTES+1 — stub .size instead.
    const file = makeFile("text/plain");
    Object.defineProperty(file, "size", { value: MAX_FILE_BYTES + 1 });
    await expect(adapter.add({ file })).rejects.toThrow(/too large/);
  });

  it("send() uploads to the chat-upload endpoint and stashes the attachment id", async () => {
    uploadForChatThread.mockClear();
    const adapter = createFileAttachmentAdapter(existingThread);
    const pending = (await adapter.add({
      file: makeFile("text/plain"),
    })) as PendingAttachment;
    const complete = await adapter.send(pending);

    expect(uploadForChatThread).toHaveBeenCalledWith(
      "n.ChatThread.t1",
      pending.file,
    );
    expect(complete.status.type).toBe("complete");
    const part = complete.content[0] as unknown as {
      type: string;
      filename: string;
      attachment_id: string;
    };
    expect(part.type).toBe("file");
    expect(part.filename).toBe("notes.txt");
    expect(part.attachment_id).toBe("n.Attachment.abc123");
  });

  it("send() creates a thread on demand when there is none yet (fresh conversation)", async () => {
    uploadForChatThread.mockClear();
    const ensureThreadId = vi.fn(() => Promise.resolve("n.ChatThread.new"));
    const adapter = createFileAttachmentAdapter(ensureThreadId);
    const pending = (await adapter.add({
      file: makeFile("text/plain"),
    })) as PendingAttachment;

    const complete = await adapter.send(pending);

    expect(ensureThreadId).toHaveBeenCalledTimes(1);
    expect(uploadForChatThread).toHaveBeenCalledWith(
      "n.ChatThread.new",
      pending.file,
    );
    expect(complete.status.type).toBe("complete");
  });
});
