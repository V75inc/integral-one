import { describe, it, expect } from 'vitest';

import { extractAttachmentListsFromParts } from '../extractAttachmentListsFromParts';

const FILE = {
  id: 'n.Attachment.abc',
  filename: 'report.pdf',
  mime_type: 'application/pdf',
  size: 2048,
  source_type: 'file' as const,
};

describe('extractAttachmentListsFromParts', () => {
  it('returns nothing when there are no tool-call parts', () => {
    expect(extractAttachmentListsFromParts([], [])).toEqual([]);
    expect(
      extractAttachmentListsFromParts(
        [{ type: 'text', result: 'hello' }],
        undefined,
      ),
    ).toEqual([]);
  });

  it('parses a JSON-stringified attachment_list tool result from parts', () => {
    const payload = {
      _kind: 'attachment_list',
      entry_id: 'n.Entry.1',
      total: 1,
      attachments: [FILE],
    };
    const lists = extractAttachmentListsFromParts(undefined, [
      {
        type: 'tool-call',
        result: JSON.stringify(payload),
      },
    ]);
    expect(lists).toHaveLength(1);
    expect(lists[0].key).toBe('n.Entry.1');
    expect(lists[0].scope).toBe('entry');
    expect(lists[0].attachments).toEqual([FILE]);
  });

  it('parses a track-scoped attachment_list (track_id key, no entry_id)', () => {
    const payload = {
      _kind: 'attachment_list',
      track_id: 'n.Track.7',
      total: 1,
      attachments: [{ ...FILE, entry_id: 'n.Entry.9', entry_title: 'E9' }],
    };
    const lists = extractAttachmentListsFromParts(undefined, [
      { type: 'tool-call', result: payload },
    ]);
    expect(lists).toHaveLength(1);
    expect(lists[0].key).toBe('track:n.Track.7');
    expect(lists[0].scope).toBe('track');
    expect(lists[0].attachments).toHaveLength(1);
  });

  it('parses a workspace-scoped attachment_list', () => {
    const payload = {
      _kind: 'attachment_list',
      workspace_id: 'n.Workspace.1',
      total: 1,
      attachments: [
        {
          ...FILE,
          entry_id: 'n.Entry.9',
          entry_title: 'E9',
          track_id: 'n.Track.7',
        },
      ],
    };
    const lists = extractAttachmentListsFromParts(undefined, [
      { type: 'tool-call', result: payload },
    ]);
    expect(lists).toHaveLength(1);
    expect(lists[0].key).toBe('workspace:n.Workspace.1');
    expect(lists[0].scope).toBe('workspace');
  });

  it('deduplicates by entry_id when the same list appears in content and parts', () => {
    const payload = {
      _kind: 'attachment_list',
      entry_id: 'n.Entry.dup',
      attachments: [FILE],
    };
    const part = { type: 'tool-call' as const, result: payload };
    const lists = extractAttachmentListsFromParts([part], [part]);
    expect(lists).toHaveLength(1);
  });

  it('ignores errored tool calls and non-attachment_list results', () => {
    const lists = extractAttachmentListsFromParts(
      [
        { type: 'tool-call', isError: true, result: { _kind: 'attachment_list' } },
        {
          type: 'tool-call',
          result: { _kind: 'staged_change', staged_token: 'tok' },
        },
      ],
      undefined,
    );
    expect(lists).toEqual([]);
  });
});
