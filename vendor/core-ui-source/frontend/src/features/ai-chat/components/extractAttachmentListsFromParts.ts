import type { Attachment } from '../../../types';

import { coerceToolResult } from '../staging/StagedChangeToolUI';

type ToolishPart = { type?: string; result?: unknown; isError?: boolean };

/**
 * Scan assistant message tool-call parts for attachment-list results
 * (``_kind: "attachment_list"`` — emitted by ``integral_list_attachments``,
 * ``integral_list_track_attachments``, and
 * ``integral_list_workspace_attachments``) and return deduplicated lists for
 * rendering.
 */
export function extractAttachmentListsFromParts(
  content: ReadonlyArray<ToolishPart> | undefined,
  parts: ReadonlyArray<ToolishPart> | undefined,
): Array<{
  key: string;
  attachments: Attachment[];
  scope: 'entry' | 'track' | 'workspace';
}> {
  const all = [
    ...((content as ReadonlyArray<ToolishPart> | undefined) ?? []),
    ...((parts as ReadonlyArray<ToolishPart> | undefined) ?? []),
  ];
  const out: Array<{
    key: string;
    attachments: Attachment[];
    scope: 'entry' | 'track' | 'workspace';
  }> = [];
  const seen = new Set<string>();
  for (const part of all) {
    if (part?.type !== 'tool-call' || part.isError) continue;
    const coerced = coerceToolResult(part.result) as
      | {
          _kind?: string;
          entry_id?: string;
          track_id?: string;
          workspace_id?: string;
          attachments?: Attachment[];
        }
      | null;
    if (!coerced || coerced._kind !== 'attachment_list') continue;
    let key: string;
    let scope: 'entry' | 'track' | 'workspace';
    if (coerced.workspace_id) {
      key = `workspace:${coerced.workspace_id}`;
      scope = 'workspace';
    } else if (coerced.track_id) {
      key = `track:${coerced.track_id}`;
      scope = 'track';
    } else if (coerced.entry_id) {
      key = coerced.entry_id;
      scope = 'entry';
    } else {
      key = `att-${out.length}`;
      scope = 'entry';
    }
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ key, attachments: coerced.attachments ?? [], scope });
  }
  return out;
}
