import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { RotateCw } from "lucide-react";

import type { Attachment } from "../../../types";
import { attachmentsApi } from "../../../api/attachments";
import { useToast } from "../../../context/ToastContext";
import { LINE_ICON_STROKE } from "../../ui/IconWell";
import { Button } from "../../ui/Button";
import { Text } from "../../../ui";
import { useAuthOptional } from "../../../context/AuthContext";
import { useScopeOptional } from "../../../context/ScopeContext";

/**
 * Renders native metadata and source-bound multimodal image observations.
 *
 * The shape is ``{common, type_specific}``; we render common first
 * (page count, dimensions, duration) followed by the type-specific
 * bag verbatim, with a "Reprocess" affordance for re-running
 * extraction when the status is partial/failed/skipped.
 */

interface MetadataPanelProps {
  attachment: Attachment;
}

export function MetadataPanel({
  attachment: initialAttachment,
}: MetadataPanelProps) {
  const { showToast } = useToast();
  const [reprocessing, setReprocessing] = useState(false);
  const auth = useAuthOptional();
  const scope = useScopeOptional();
  const query = useQuery({
    queryKey: [
      "attachment-metadata",
      auth?.user?.id,
      scope?.scope?.workspaceId,
      initialAttachment.id,
    ],
    queryFn: () => attachmentsApi.get(initialAttachment.id),
    enabled: !!auth?.user && !!scope?.scope?.workspaceId,
  });
  const attachment =
    query.data?.attachment.id === initialAttachment.id
      ? { ...initialAttachment, ...query.data.attachment }
      : initialAttachment;
  const semantic = attachment.metadata?.semantic;
  const description =
    semantic && semantic.source_hash === attachment.content_hash
      ? semantic.description
      : undefined;
  const isImage = attachment.mime_type?.startsWith("image/") ?? false;
  const visibleText = isImage
    ? description
      ? semantic?.visible_text
      : ""
    : attachment.extracted_text;

  const status = attachment.metadata_status || "pending";
  const common = attachment.metadata?.common ?? {};
  const typed = attachment.metadata?.type_specific ?? {};
  const canReprocess =
    ["pending", "partial", "failed", "skipped"].includes(status) ||
    (isImage && !description);

  const handleReprocess = async () => {
    setReprocessing(true);
    try {
      await attachmentsApi.reprocess(attachment.id);
      await query.refetch();
      showToast("File metadata updated.", "success");
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Reprocess failed", "error");
    } finally {
      setReprocessing(false);
    }
  };

  return (
    <div className="space-y-3 text-xs text-[var(--text)]">
      <header className="flex items-center justify-between">
        <h3 className="text-[11px] font-medium uppercase tracking-wider text-[var(--text-muted)]">
          Metadata
        </h3>
        <Button
          variant="ghost"
          size="sm"
          disabled={query.isFetching}
          onClick={() =>
            void query.refetch().then((result) => {
              if (result.error)
                showToast("Could not refresh metadata.", "error");
            })
          }
        >
          Refresh
        </Button>
        {canReprocess && (
          <button
            type="button"
            onClick={handleReprocess}
            disabled={reprocessing}
            className="inline-flex items-center gap-1 rounded-[var(--radius-input)] border border-[var(--panel-border)] bg-[var(--panel-2)] px-2 py-0.5 text-[10px] text-[var(--text-muted)] hover:text-[var(--text)] disabled:opacity-50"
          >
            <RotateCw size={10} strokeWidth={LINE_ICON_STROKE} />
            Reprocess
          </button>
        )}
      </header>

      <StatusBadge status={status} message={attachment.metadata_error} />
      {isImage && !description && (
        <Text as="p" variant="body-sm" tone="muted">
          No image description is available yet. Automatic image analysis uses a
          vision-capable model configured in{" "}
          <a href="/settings#ai-models" className="underline">
            AI Models
          </a>
          .
        </Text>
      )}
      {description && (
        <Section title="Image description · AI generated">
          <Text as="p" variant="body-sm">
            {description}
          </Text>
          {semantic?.keywords?.length ? (
            <Text as="p" variant="meta" tone="muted">
              {semantic.keywords.join(" · ")}
            </Text>
          ) : null}
          <Text as="p" variant="meta" tone="muted">
            Generated observations can be imperfect. Refer to the image to
            verify details.
          </Text>
        </Section>
      )}

      {(Object.keys(common).length > 0 ||
        attachment.page_count != null ||
        attachment.width != null) && (
        <Section title="Common">
          <KVList
            entries={[
              ["Page count", attachment.page_count ?? common.page_count],
              ["Width", attachment.width ?? common.width],
              ["Height", attachment.height ?? common.height],
              [
                "Duration (s)",
                (common.duration_seconds as number | undefined) ?? undefined,
              ],
            ]}
          />
        </Section>
      )}

      {Object.keys(typed).length > 0 && (
        <Section title="Type-specific">
          <KVList
            entries={Object.entries(typed).filter(
              ([key]) => key !== "text_locations",
            )}
          />
        </Section>
      )}

      {visibleText && (
        <Section
          title={isImage ? "Visible text · AI generated" : "Text preview"}
        >
          <pre className="max-h-48 overflow-auto whitespace-pre-wrap rounded-[var(--radius-input)] border border-[var(--panel-border)] bg-[var(--panel-2)]/40 p-2 text-[10px] leading-relaxed text-[var(--text-muted)]">
            {visibleText.slice(0, 4000)}
            {visibleText.length > 4000 && "\n…"}
          </pre>
        </Section>
      )}

      {attachment.scan_status && (
        <Section title="Scan">
          <KVList
            entries={[
              ["Status", attachment.scan_status],
              ["Engine", attachment.scan_engine],
              ["Message", attachment.scan_message],
            ]}
          />
        </Section>
      )}
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-1.5">
      <h4 className="text-[10px] font-medium uppercase tracking-wider text-[var(--text-muted)]">
        {title}
      </h4>
      {children}
    </section>
  );
}

function StatusBadge({
  status,
  message,
}: {
  status: string;
  message?: string;
}) {
  const tone =
    status === "complete"
      ? "bg-[var(--success-fg)]/15 text-[var(--success-fg)]"
      : status === "failed"
        ? "bg-[var(--danger-fg)]/15 text-[var(--danger-fg)]"
        : status === "partial"
          ? "bg-[var(--warn-fg)]/15 text-[var(--warn-fg)]"
          : "bg-[var(--panel-2)] text-[var(--text-muted)]";
  return (
    <div
      className={`inline-flex items-center gap-1 rounded-[var(--radius-pill)] px-2 py-0.5 text-[10px] font-medium ${tone}`}
      title={message || undefined}
    >
      File metadata: {status}
    </div>
  );
}

function KVList({ entries }: { entries: Array<[string, unknown]> }) {
  const visible = entries.filter(
    ([, v]) => v !== undefined && v !== null && v !== "",
  );
  if (!visible.length) {
    return (
      <p className="text-[10px] italic text-[var(--text-subtle)]">
        Nothing extracted.
      </p>
    );
  }
  return (
    <dl className="grid grid-cols-[auto,1fr] gap-x-2 gap-y-1">
      {visible.map(([k, v]) => (
        <KVRow key={k} label={k} value={v} />
      ))}
    </dl>
  );
}

function KVRow({ label, value }: { label: string; value: unknown }) {
  return (
    <>
      <dt className="text-[10px] uppercase tracking-wider text-[var(--text-subtle)]">
        {label}
      </dt>
      <dd className="break-words text-[11px] text-[var(--text)]">
        {formatValue(value)}
      </dd>
    </>
  );
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}
