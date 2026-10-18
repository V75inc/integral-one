import type { PendingAttachment } from "@assistant-ui/react";
import { describe, expect, it, vi } from "vitest";

import {
  createImageAttachmentAdapter,
  imageAttachmentAdapter,
  MAX_IMAGE_BYTES,
} from "../imageAttachmentAdapter";

const upload = vi.fn();
vi.mock("../../../../api/attachments", () => ({
  attachmentsApi: { uploadForChatThread: (...args: unknown[]) => upload(...args) },
}));

function makeFile(type: string, bytes = 4, name = "x.png"): File {
  return new File([new Uint8Array(bytes)], name, { type });
}

describe("imageAttachmentAdapter", () => {
  it("accepts the allowed image types", () => {
    expect(imageAttachmentAdapter.accept).toContain("image/png");
    expect(imageAttachmentAdapter.accept).toContain("image/webp");
  });

  it("add() returns a pending image attachment", async () => {
    const pending = (await imageAttachmentAdapter.add({
      file: makeFile("image/png"),
    })) as PendingAttachment;
    expect(pending.type).toBe("image");
    expect(pending.contentType).toBe("image/png");
    expect(pending.status.type).toBe("requires-action");
  });

  it("add() rejects an unsupported type", async () => {
    await expect(
      imageAttachmentAdapter.add({
        file: makeFile("application/pdf", 4, "x.pdf"),
      }),
    ).rejects.toThrow(/Unsupported/);
  });

  it("add() rejects an oversize image", async () => {
    await expect(
      imageAttachmentAdapter.add({
        file: makeFile("image/png", MAX_IMAGE_BYTES + 1),
      }),
    ).rejects.toThrow(/too large/);
  });

  it("send() produces an image data-URL part", async () => {
    const pending = (await imageAttachmentAdapter.add({
      file: makeFile("image/png"),
    })) as PendingAttachment;
    const complete = await imageAttachmentAdapter.send(pending);
    expect(complete.status.type).toBe("complete");
    const part = complete.content[0] as { type: string; image: string };
    expect(part.type).toBe("image");
    expect(part.image).toMatch(/^data:image\/png;base64,/);
  });
});

describe("persisted image adapter", () => {
  it("keeps vision content and the real uploaded attachment in the same turn", async () => {
    upload.mockResolvedValue({id: "n.Attachment.receipt", filename: "x.png", mime_type: "image/png"});
    const ensureThread = vi.fn(async () => "n.ChatThread.new");
    const adapter = createImageAttachmentAdapter(ensureThread);
    const pending = await adapter.add({file: makeFile("image/png")}) as PendingAttachment;
    const complete = await adapter.send(pending);
    expect(ensureThread).toHaveBeenCalledOnce();
    expect(upload).toHaveBeenCalledWith("n.ChatThread.new", pending.file);
    expect(complete.content).toEqual([
      expect.objectContaining({type: "image", image: expect.stringMatching(/^data:image\/png;base64,/)}),
      expect.objectContaining({type: "file", attachment_id: "n.Attachment.receipt"}),
    ]);
  });
  it("does not send a vision-only turn when persistence fails", async () => {
    upload.mockRejectedValue(new Error("Upload failed"));
    const adapter = createImageAttachmentAdapter(async () => "n.ChatThread.new");
    const pending = await adapter.add({file: makeFile("image/png")}) as PendingAttachment;
    await expect(adapter.send(pending)).rejects.toThrow("Upload failed");
  });
});
