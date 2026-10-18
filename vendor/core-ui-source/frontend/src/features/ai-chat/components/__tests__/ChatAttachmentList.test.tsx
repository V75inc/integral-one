/**
 * ChatAttachmentList — the agent-delivered attachment card. It now delegates to
 * the shared AttachmentRowList so inline chat files have the SAME controls as
 * the entry-detail surface (June 29 QA #5): preview (eye), download, copy-link.
 * Covers the empty state, per-file rendering, the authenticated fetch-then-blob
 * download path, and the URL open-link affordance.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

vi.mock("../../../../api/attachments", () => ({
  attachmentsApi: {
    fetchDownloadBlob: vi.fn(async () => ({
      blob: new Blob(["x"], { type: "application/pdf" }),
      contentType: "application/pdf",
    })),
    delete: vi.fn(),
  },
}));

const { showToast } = vi.hoisted(() => ({ showToast: vi.fn() }));
vi.mock("../../../../context/ToastContext", () => ({
  useToast: () => ({ showToast }),
}));

import { attachmentsApi } from "../../../../api/attachments";
import { ChatAttachmentList } from "../ChatAttachmentList";

const FILE = {
  id: "n.Attachment.abc",
  filename: "q3-board-report.pdf",
  mime_type: "application/pdf",
  size: 2048,
  source_type: "file" as const,
};

beforeEach(() => {
  vi.clearAllMocks();
  // jsdom has no object-URL plumbing; the download path calls these.
  URL.createObjectURL = vi.fn(() => "blob:mock");
  URL.revokeObjectURL = vi.fn();
});

describe("ChatAttachmentList", () => {
  it("renders an empty-state when there are no attachments", () => {
    render(<ChatAttachmentList attachments={[]} />);
    expect(screen.getByText(/no attachments/i)).toBeTruthy();
  });

  it("renders a row per attachment with its filename", () => {
    render(<ChatAttachmentList attachments={[FILE]} />);
    expect(screen.getByText("q3-board-report.pdf")).toBeTruthy();
  });

  it("exposes a preview control for a previewable file (parity with entry detail)", () => {
    render(<ChatAttachmentList attachments={[FILE]} />);
    // A PDF is viewable in-app, so the shared row renders the eye/Open control.
    expect(screen.getByLabelText("Open")).toBeTruthy();
  });

  it("downloads a file attachment via the authenticated blob path", async () => {
    render(<ChatAttachmentList attachments={[FILE]} />);
    fireEvent.click(screen.getByLabelText("Download"));
    await waitFor(() =>
      expect(attachmentsApi.fetchDownloadBlob).toHaveBeenCalledWith(
        "n.Attachment.abc",
      ),
    );
    expect(URL.createObjectURL).toHaveBeenCalled();
  });

  it("opens a URL attachment's external target without a blob fetch", () => {
    const openSpy = vi.spyOn(window, "open").mockImplementation(() => null);
    render(
      <ChatAttachmentList
        attachments={[
          {
            id: "n.Attachment.url",
            filename: "Spec",
            source_type: "url" as const,
            external_url: "https://example.com/spec",
          },
        ]}
      />,
    );
    fireEvent.click(screen.getByLabelText("Open link"));
    expect(openSpy).toHaveBeenCalledWith(
      "https://example.com/spec",
      "_blank",
      "noopener,noreferrer",
    );
    expect(attachmentsApi.fetchDownloadBlob).not.toHaveBeenCalled();
  });
});
