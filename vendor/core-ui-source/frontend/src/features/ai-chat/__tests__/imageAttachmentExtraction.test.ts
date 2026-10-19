/**
 * `imagesFromContent` / `attachmentContentParts` — regression coverage for
 * the "I didn't receive an image with your message" bug.
 *
 * assistant-ui's composer `send()` (base-composer-runtime-core.js) builds the
 * `AppendMessage` with `content: text ? [{type:"text",text}] : []` and puts
 * each resolved attachment's parts on a SEPARATE `attachments[].content`
 * array — never inlined into `content`. Reading only `message.content` for
 * images always returns `[]`, silently dropping every attached image.
 */
import { describe, it, expect } from "vitest";
import type { AppendMessage } from "@assistant-ui/react";
import {
  attachmentContentParts,
  attachmentIdsFromContent,
  imagesFromContent,
} from "../useAIChatRuntime";

const PNG_DATA_URL =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";

function appendMessageWithImageAttachment(caption: string): AppendMessage {
  return {
    role: "user",
    content: caption ? [{ type: "text", text: caption }] : [],
    attachments: [
      {
        id: "att-1",
        type: "image",
        name: "test.png",
        contentType: "image/png",
        status: { type: "complete" },
        content: [{ type: "image", image: PNG_DATA_URL }],
      },
    ],
    parentId: null,
    sourceId: null,
    runConfig: undefined,
  } as unknown as AppendMessage;
}

describe("attachmentContentParts + imagesFromContent", () => {
  it("finds the image on message.attachments[].content, not message.content", () => {
    const message = appendMessageWithImageAttachment("what is this?");
    // Reproduces the bug: message.content alone never has the image part.
    expect(imagesFromContent(message.content as never)).toEqual([]);

    const parts = attachmentContentParts(message);
    const images = imagesFromContent(parts);
    expect(images).toEqual([
      {
        content_type: "image/png",
        data: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
      },
    ]);
  });

  it("still works for a caption-only text message with no attachments", () => {
    const message = {
      role: "user",
      content: [{ type: "text", text: "hello" }],
      attachments: [],
      parentId: null,
      sourceId: null,
      runConfig: undefined,
    } as unknown as AppendMessage;

    expect(imagesFromContent(attachmentContentParts(message))).toEqual([]);
  });
});

describe("attachmentIdsFromContent", () => {
  it("reads the attachment_id stashed on a file part by fileAttachmentAdapter", () => {
    const message = {
      role: "user",
      content: [{ type: "text", text: "here's a doc" }],
      attachments: [
        {
          id: "att-1",
          type: "file",
          name: "notes.txt",
          contentType: "text/plain",
          status: { type: "complete" },
          content: [
            {
              type: "file",
              filename: "notes.txt",
              mimeType: "text/plain",
              data: "",
              attachment_id: "n.Attachment.xyz",
            },
          ],
        },
      ],
      parentId: null,
      sourceId: null,
      runConfig: undefined,
    } as unknown as AppendMessage;

    expect(attachmentIdsFromContent(attachmentContentParts(message))).toEqual([
      "n.Attachment.xyz",
    ]);
  });

  it("returns an empty array when there are no file parts", () => {
    const message = {
      role: "user",
      content: [{ type: "text", text: "hello" }],
      attachments: [],
      parentId: null,
      sourceId: null,
      runConfig: undefined,
    } as unknown as AppendMessage;

    expect(attachmentIdsFromContent(attachmentContentParts(message))).toEqual([]);
  });
});
