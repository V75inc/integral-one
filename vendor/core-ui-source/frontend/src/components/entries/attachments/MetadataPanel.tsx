import { useState } from 'react';
import { RotateCw } from 'lucide-react';

import type { Attachment } from '../../../types';
import { attachmentsApi } from '../../../api/attachments';
import { useToast } from '../../../context/ToastContext';
import { LINE_ICON_STROKE } from '../../ui/IconWell';

/**
 * Renders the queryable metadata produced by the Phase 1.5 pipeline.
 *
 * The shape is ``{common, type_specific}``; we render common first
 * (page count, dimensions, duration) followed by the type-specific
 * bag verbatim, with a "Reprocess" affordance for re-running
 * extraction when the status is partial/failed/skipped.
 */

interface MetadataPanelProps {
  attachment: Attachment;
}

export function MetadataPanel({ attachment }: MetadataPanelProps) {
  const { showToast } = useToast();
  const [reprocessing, setReprocessing] = useState(false);

  const status = attachment.metadata_status || 'pending';
  const common = attachment.metadata?.common ?? {};
  const typed = attachment.metadata?.type_specific ?? {};
  const canReprocess = ['pending', 'partial', 'failed', 'skipped'].includes(
    status
  );

  const handleReprocess = async () => {
    setReprocessing(true);
    try {
      await attachmentsApi.reprocess(attachment.id);
      showToast('Metadata reprocessed', 'success');
    } catch (e) {
      showToast(
        e instanceof Error ? e.message : 'Reprocess failed',
        'error'
      );
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

      {(Object.keys(common).length > 0 ||
        attachment.page_count != null ||
        attachment.width != null) && (
        <Section title="Common">
          <KVList
            entries={[
              ['Page count', attachment.page_count ?? common.page_count],
              ['Width', attachment.width ?? common.width],
              ['Height', attachment.height ?? common.height],
              [
                'Duration (s)',
                (common.duration_seconds as number | undefined) ?? undefined,
              ],
            ]}
          />
        </Section>
      )}

      {Object.keys(typed).length > 0 && (
        <Section title="Type-specific">
          <KVList entries={Object.entries(typed)} />
        </Section>
      )}

      {attachment.extracted_text && (
        <Section title="Text preview">
          <pre className="max-h-48 overflow-auto whitespace-pre-wrap rounded-[var(--radius-input)] border border-[var(--panel-border)] bg-[var(--panel-2)]/40 p-2 text-[10px] leading-relaxed text-[var(--text-muted)]">
            {attachment.extracted_text.slice(0, 4000)}
            {attachment.extracted_text.length > 4000 && '\n…'}
          </pre>
        </Section>
      )}

      {attachment.scan_status && (
        <Section title="Scan">
          <KVList
            entries={[
              ['Status', attachment.scan_status],
              ['Engine', attachment.scan_engine],
              ['Message', attachment.scan_message],
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
    status === 'complete'
      ? 'bg-[var(--success-fg)]/15 text-[var(--success-fg)]'
      : status === 'failed'
      ? 'bg-[var(--danger-fg)]/15 text-[var(--danger-fg)]'
      : status === 'partial'
      ? 'bg-[var(--warn-fg)]/15 text-[var(--warn-fg)]'
      : 'bg-[var(--panel-2)] text-[var(--text-muted)]';
  return (
    <div
      className={`inline-flex items-center gap-1 rounded-[var(--radius-pill)] px-2 py-0.5 text-[10px] font-medium ${tone}`}
      title={message || undefined}
    >
      Status: {status}
    </div>
  );
}

function KVList({
  entries,
}: {
  entries: Array<[string, unknown]>;
}) {
  const visible = entries.filter(
    ([, v]) => v !== undefined && v !== null && v !== ''
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
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}
