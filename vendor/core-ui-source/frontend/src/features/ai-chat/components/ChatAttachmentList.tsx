import type { Attachment } from '../../../types';
import { AttachmentRowList } from '../../../components/entries/attachments';
import { Text } from '../../../ui';

/**
 * Renders an attachment list delivered by the agent's attachment list tools
 * (`_kind: "attachment_list"` from entry-, track-, or workspace-scoped listers).
 *
 * Delegates to the shared {@link AttachmentRowList} so the inline chat listing
 * has the SAME controls as the entry-detail surface (June 29 QA #5): click a
 * previewable file to open the in-app viewer modal (image / pdf / text / docx /
 * xlsx / pptx / media, with prev/next navigation), plus per-row download and
 * copy-link. Previously this rendered a bespoke download-only row with no
 * preview affordance, which diverged from every other attachment surface.
 *
 * Chat is a read/deliver context — no delete or card-preview controls are
 * wired here (those belong to the entry-detail editing surface).
 */
export function ChatAttachmentList({
  attachments,
  scopeLabel,
}: {
  attachments: Attachment[];
  /** Optional scope hint for the empty state (entry / track / workspace). */
  scopeLabel?: 'entry' | 'track' | 'workspace';
}) {
  if (!attachments || attachments.length === 0) {
    const emptyCopy =
      scopeLabel === 'workspace'
        ? 'No attachments in this workspace.'
        : scopeLabel === 'track'
          ? 'No attachments in this track.'
          : 'No attachments on this entry.';
    return (
      <div className="my-1.5 rounded-md border border-[var(--border)] px-3 py-2">
        <Text variant="meta" tone="muted">
          {emptyCopy}
        </Text>
      </div>
    );
  }
  return (
    <div className="my-1.5 rounded-md border border-[var(--border)] p-1.5">
      <AttachmentRowList attachments={attachments} />
    </div>
  );
}
