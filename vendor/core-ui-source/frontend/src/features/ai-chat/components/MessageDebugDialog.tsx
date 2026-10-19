import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Bug, Check, Copy, X } from "lucide-react";

import JsonViewer from "../../../components/ui/JsonViewer";
import { useTheme } from "../../../context/ThemeContext";
import { compactMessageDebugPayload } from "./assistantMessagePresentation";
import { tryParseJsonDisplay } from "../../../utils/tryParseJsonDisplay";

type MessageDebugDialogProps = {
  /** Assembled response text (Panel 1) — rendered as a JSON tree if it parses,
   *  otherwise verbatim in a <pre>. Mirrors jvchat's "Message Content". */
  messageContent?: string;
  /** Server final payload or reconstructed message diagnostics (Panel 2). */
  payload: Record<string, unknown> | null;
  onClose: () => void;
};

export function MessageDebugDialog({
  messageContent,
  payload,
  onClose,
}: MessageDebugDialogProps) {
  const debugPayload = useMemo(
    () => payload ? compactMessageDebugPayload(payload) : null,
    [payload],
  );
  const { theme } = useTheme();
  const dark = theme === "dark";
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(JSON.stringify(debugPayload ?? {}, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }, [debugPayload]);

  // jvchat parses the response text: JSON object/array → tree, else raw <pre>.
  const parsedContent = useMemo(
    () => tryParseJsonDisplay(messageContent),
    [messageContent],
  );
  const hasContent = !!messageContent && messageContent.trim().length > 0;
  const hasPayload = payload != null;
  const claimProvenance =
    payload &&
    typeof payload === "object" &&
    payload.claim_provenance &&
    typeof payload.claim_provenance === "object"
      ? payload.claim_provenance
      : null;
  const claimTools =
    claimProvenance &&
    Array.isArray((claimProvenance as Record<string, unknown>).tools)
      ? ((claimProvenance as Record<string, unknown>).tools as unknown[])
      : [];
  const queryResultProvenance = claimTools.filter(
    (tool): tool is Record<string, unknown> =>
      !!tool &&
      typeof tool === "object" &&
      (tool as Record<string, unknown>).source === "query" &&
      typeof (tool as Record<string, unknown>).result_set_id === "string",
  );
  const queryReceipt = queryResultProvenance.find(
    (tool) => tool.receipt && typeof tool.receipt === "object",
  )?.receipt;
  const runReceipt =
    (payload &&
      typeof payload === "object" &&
      (payload.run_id || payload.receipt)) ||
    queryReceipt
      ? {
          run_id:
            payload?.run_id ?? queryResultProvenance[0]?.run_id ?? null,
          receipt: payload?.receipt ?? queryReceipt ?? null,
        }
      : null;

  return createPortal(
    <div
      className="fixed inset-0 z-overlay flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-[var(--radius-card)] border border-[var(--border-subtle)] bg-[var(--panel)] shadow-[var(--shadow-pop)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex flex-shrink-0 items-center justify-between border-b border-[var(--border-subtle)] px-4 py-3">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-[var(--text)]">
            <Bug className="h-4 w-4" />
            Message debug
          </h3>
          <button
            onClick={onClose}
            className="rounded-md p-1 text-[var(--text-muted)] transition-colors hover:bg-[var(--panel-2)] hover:text-[var(--text)]"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {runReceipt != null ? (
            <div className="mb-4">
              <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                Run receipt
              </h4>
              <JsonViewer
                data={runReceipt}
                defaultExpandDepth={3}
                maxHeight="24vh"
                dark={dark}
              />
            </div>
          ) : null}

          {queryResultProvenance.length > 0 ? (
            <div className="mb-4">
              <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                Query result provenance
              </h4>
              <JsonViewer
                data={queryResultProvenance}
                defaultExpandDepth={3}
                maxHeight="30vh"
                dark={dark}
              />
            </div>
          ) : null}

          {/* Panel 0 — Claim provenance: page context vs executed QuerySpec. */}
          {claimProvenance != null ? (
            <div className="mb-4">
              <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                Claim provenance
              </h4>
              <JsonViewer
                data={claimProvenance}
                defaultExpandDepth={3}
                maxHeight="30vh"
                dark={dark}
              />
            </div>
          ) : null}

          {/* Panel 1 — Message Content (parsed if JSON, else verbatim). */}
          <div className="mb-4">
            <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
              Message Content
            </h4>
            {parsedContent != null ? (
              <JsonViewer
                data={parsedContent}
                defaultExpandDepth={2}
                maxHeight="40vh"
                dark={dark}
              />
            ) : hasContent ? (
              <pre className="max-h-[40vh] overflow-auto whitespace-pre-wrap rounded border border-[var(--border-subtle)] bg-[var(--panel-2)] p-3 font-mono text-xs text-[var(--text)]">
                {messageContent}
              </pre>
            ) : (
              <div className="rounded border border-[var(--border-subtle)] bg-[var(--panel-2)] p-3 text-xs italic text-[var(--text-muted)]">
                No text content for this message.
              </div>
            )}
          </div>

          {/* The viewer and copy action use the same compact diagnostic projection. */}
          <div>
            <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
              Diagnostic payload
            </h4>
            {hasPayload ? (
              <JsonViewer
                data={debugPayload}
                defaultExpandDepth={2}
                maxHeight="50vh"
                dark={dark}
              />
            ) : (
              <div className="rounded border border-[var(--border-subtle)] bg-[var(--panel-2)] p-3 text-xs italic text-[var(--text-muted)]">
                No debug data captured for this message.
              </div>
            )}
          </div>
        </div>

        <div className="flex flex-shrink-0 items-center justify-end gap-2 border-t border-[var(--border-subtle)] px-4 py-2">
          <button
            onClick={handleCopy}
            className="inline-flex items-center gap-1.5 rounded-md border border-[var(--border-subtle)] px-2.5 py-1 text-xs text-[var(--text)] transition-colors hover:bg-[var(--panel-2)]"
          >
            {copied ? (
              <Check className="h-3.5 w-3.5" />
            ) : (
              <Copy className="h-3.5 w-3.5" />
            )}
            {copied ? "Copied" : "Copy JSON"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
