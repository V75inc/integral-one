import { describe, expect, it } from 'vitest';
import {
  DEFAULT_KANBAN_GROUP_BY,
  buildKanbanWorkflowEnumLabels,
  entryTypeMatchesSlug,
  generateKanbanColumnKey,
  isKanbanCardFieldCandidate,
  resolveDefaultKanbanCardFields,
  resolveEffectiveKanbanCardFields,
  resolveKanbanCreateCustomFieldFallback,
  resolveKanbanWorkflowEnumLabelsForTrack,
  resolveEntryColumnKey,
  resolveKanbanGroupBy,
  resolveKanbanGroupFieldKey,
  resolveKanbanSchemaFields,
  resolveKanbanWriteFieldKey,
  resolveViewCreateEntryTypeKey,
  shouldRouteKanbanQuickAddToCompose,
  shouldSyncKanbanColumnEnum,
  shouldSyncKanbanColumnEnumForView,
  slugMatchesAllowedEntryTypes,
  uniqueKanbanColumnKey,
} from '../kanbanColumnUtils';
import type { OperationalModelFieldSpec, Entry, EntryTypeNode, SavedView } from '../../../types';

function entry(
  id: string,
  overrides: Partial<Entry> & { custom_fields?: Record<string, unknown> } = {}
): Entry {
  return {
    id,
    title: overrides.title ?? `Entry ${id}`,
    type: overrides.type ?? 'task',
    track_id: 'track-1',
    author_id: 'user-1',
    created_at: overrides.created_at ?? '2026-05-01T10:00:00Z',
    custom_fields: overrides.custom_fields,
    ...overrides,
  } as Entry;
}

describe('uniqueKanbanColumnKey', () => {
  it('slugifies labels and dedupes collisions', () => {
    expect(uniqueKanbanColumnKey('New Column', [])).toBe('new_column');
    expect(uniqueKanbanColumnKey('New Column', ['new_column'])).toBe('new_column_2');
    expect(uniqueKanbanColumnKey('New Column', ['new_column', 'new_column_2'])).toBe(
      'new_column_3'
    );
  });
});

describe('generateKanbanColumnKey', () => {
  it('produces opaque col_ prefixed keys not derived from labels', () => {
    const key = generateKanbanColumnKey([]);
    expect(key).toMatch(/^col_[a-f0-9]{12}$/);
    expect(key).not.toBe('new_column');
  });

  it('dedupes against existing column keys', () => {
    const first = generateKanbanColumnKey([]);
    const second = generateKanbanColumnKey([first]);
    expect(second).not.toBe(first);
    expect(second).toMatch(/^col_[a-f0-9]{12}$/);
  });
});

describe('buildKanbanWorkflowEnumLabels', () => {
  const stageFields = [
    { key: 'stage', name: 'Stage', type: 'select', enum: ['sourced', 'col_abc'] },
  ] as OperationalModelFieldSpec[];

  it('maps kanban column keys to labels for the group_by workflow field', () => {
    const view = {
      id: 'v1',
      name: 'Pipeline',
      type: 'kanban',
      track_id: 't1',
      config: {
        group_by: 'custom_fields.stage',
        kanban_columns: [
          { key: 'sourced', label: 'Sourced' },
          { key: 'col_abc', label: 'Phone Screen' },
        ],
      },
    } as SavedView;
    expect(buildKanbanWorkflowEnumLabels(view, 'stage', stageFields)).toEqual({
      sourced: 'Sourced',
      col_abc: 'Phone Screen',
    });
  });

  it('returns empty when fieldKey does not match kanban group_by target', () => {
    const view = {
      id: 'v1',
      name: 'Pipeline',
      type: 'kanban',
      track_id: 't1',
      config: {
        group_by: 'custom_fields.stage',
        kanban_columns: [{ key: 'sourced', label: 'Sourced' }],
      },
    } as SavedView;
    expect(buildKanbanWorkflowEnumLabels(view, 'status', stageFields)).toEqual({});
  });
});

describe('resolveKanbanWorkflowEnumLabelsForTrack', () => {
  const fields = [
    { key: 'stage', name: 'Stage', type: 'select', enum: ['sourced'] },
  ] as OperationalModelFieldSpec[];

  it('merges labels from kanban views with active view winning on conflict', () => {
    const views = [
      {
        id: 'v-feed',
        name: 'Feed',
        type: 'feed',
        track_id: 't1',
      },
      {
        id: 'v-old',
        name: 'Old Board',
        type: 'kanban',
        track_id: 't1',
        config: {
          group_by: 'custom_fields.stage',
          kanban_columns: [{ key: 'sourced', label: 'Old Label' }],
        },
      },
      {
        id: 'v-pipeline',
        name: 'Pipeline',
        type: 'kanban',
        track_id: 't1',
        config: {
          group_by: 'custom_fields.stage',
          kanban_columns: [
            { key: 'sourced', label: 'Talent Pool' },
            { key: 'col_xyz', label: 'Phone Screen' },
          ],
        },
      },
    ] as SavedView[];

    expect(
      resolveKanbanWorkflowEnumLabelsForTrack(views, fields, 'v-pipeline')
    ).toEqual({
      stage: {
        sourced: 'Talent Pool',
        col_xyz: 'Phone Screen',
      },
    });
  });
});

describe('resolveKanbanGroupBy', () => {
  it('preserves explicit custom_fields.status', () => {
    expect(resolveKanbanGroupBy('custom_fields.status')).toBe('custom_fields.status');
  });

  it('maps bare status to system _kanban_stage', () => {
    expect(resolveKanbanGroupBy('status')).toBe(DEFAULT_KANBAN_GROUP_BY);
    expect(resolveKanbanGroupBy('')).toBe(DEFAULT_KANBAN_GROUP_BY);
  });

  it('preserves other profile field paths', () => {
    expect(resolveKanbanGroupBy('custom_fields.stage')).toBe('custom_fields.stage');
  });
});

describe('resolveKanbanGroupFieldKey', () => {
  it('reads custom_fields paths', () => {
    expect(resolveKanbanGroupFieldKey('custom_fields.stage')).toBe('stage');
    expect(resolveKanbanGroupFieldKey('custom_fields._kanban_stage')).toBe('_kanban_stage');
  });
});

describe('resolveKanbanWriteFieldKey', () => {
  const statusField = {
    key: 'status',
    name: 'Status',
    type: 'select',
    enum: ['open', 'paid'],
  };

  it('uses profile status when group_by is custom_fields.status', () => {
    expect(
      resolveKanbanWriteFieldKey('custom_fields.status', [statusField])
    ).toBe('status');
  });

  it('heals legacy _kanban_stage views to status when present', () => {
    expect(
      resolveKanbanWriteFieldKey(DEFAULT_KANBAN_GROUP_BY, [statusField])
    ).toBe('status');
  });
});

describe('resolveEntryColumnKey', () => {
  it('places entries with custom_fields.status = open in the Open column', () => {
    const invoice = entry('e1', {
      title: 'Invoice',
      custom_fields: { status: 'open' },
    });
    const columns = [
      { key: 'open', label: 'Open' },
      { key: 'paid', label: 'Paid' },
    ];
    expect(resolveEntryColumnKey(invoice, columns, 'custom_fields.status')).toBe('open');
  });

  it('heals legacy _kanban_stage group_by via status fallback', () => {
    const invoice = entry('e1', {
      title: 'Invoice',
      custom_fields: { status: 'open' },
    });
    const columns = [{ key: 'open', label: 'Open' }];
    expect(resolveEntryColumnKey(invoice, columns, DEFAULT_KANBAN_GROUP_BY)).toBe('open');
  });
});

describe('resolveViewCreateEntryTypeKey', () => {
  it('prefers default_entry_type_key then entry_type_keys', () => {
    const view = {
      id: 'v1',
      name: 'Pipeline',
      type: 'kanban',
      track_id: 't1',
      default_entry_type_key: 'qb_invoice',
      entry_type_keys: ['deal'],
    } as SavedView;
    expect(resolveViewCreateEntryTypeKey(view)).toBe('qb_invoice');
  });

  it('falls back to the first entry_type_keys slug', () => {
    const view = {
      id: 'v1',
      name: 'Pipeline',
      type: 'kanban',
      track_id: 't1',
      entry_type_keys: ['deal'],
    } as SavedView;
    expect(resolveViewCreateEntryTypeKey(view)).toBe('deal');
  });
});

describe('shouldSyncKanbanColumnEnum', () => {
  it('syncs profile select fields but not system kanban slots', () => {
    const fields = [{ key: 'stage', name: 'Stage', type: 'select', enum: ['todo'] }];
    expect(shouldSyncKanbanColumnEnum('custom_fields.stage', fields)).toBe(true);
    expect(
      shouldSyncKanbanColumnEnum('custom_fields._kanban_stage', fields)
    ).toBe(false);
    expect(shouldSyncKanbanColumnEnum('custom_fields.amount', fields)).toBe(false);
  });
});

describe('shouldSyncKanbanColumnEnumForView', () => {
  it('syncs status enum for legacy _kanban_stage views with a status field', () => {
    const fields = [{ key: 'status', name: 'Status', type: 'select', enum: ['open'] }];
    expect(shouldSyncKanbanColumnEnumForView(DEFAULT_KANBAN_GROUP_BY, fields)).toBe(true);
  });
});

describe('entryTypeMatchesSlug', () => {
  it('matches manifest keys to entry type display names', () => {
    expect(entryTypeMatchesSlug('ContentPiece', 'content_piece')).toBe(true);
    expect(entryTypeMatchesSlug('Post', 'post')).toBe(true);
    expect(entryTypeMatchesSlug('Post', 'content_piece')).toBe(false);
  });
});

describe('slugMatchesAllowedEntryTypes', () => {
  it('treats manifest keys as equivalent to slugified names', () => {
    const allowed = new Set(['contentpiece', 'campaign']);
    expect(slugMatchesAllowedEntryTypes('content_piece', allowed)).toBe(true);
    expect(slugMatchesAllowedEntryTypes('post', allowed)).toBe(false);
  });
});

const contentPieceFields: OperationalModelFieldSpec[] = [
  { key: 'publish_date', name: 'Publish date', type: 'date', index: true },
  { key: 'channel', name: 'Channel', type: 'select', index: true, enum: ['blog', 'social'] },
  { key: 'status', name: 'Status', type: 'select', index: true, required: true, enum: ['draft'] },
  { key: 'word_count', name: 'Word count', type: 'number' },
  { key: 'campaign', name: 'Campaign', type: 'relation', index: true, relation: { target_entry_types: ['campaign'], allow_cross_track: false, many: false } },
];

describe('isKanbanCardFieldCandidate', () => {
  it('includes indexed scalars but excludes group column and relations', () => {
    expect(isKanbanCardFieldCandidate(contentPieceFields[0], 'status')).toBe(true);
    expect(isKanbanCardFieldCandidate(contentPieceFields[1], 'status')).toBe(true);
    expect(isKanbanCardFieldCandidate(contentPieceFields[2], 'status')).toBe(false);
    expect(isKanbanCardFieldCandidate(contentPieceFields[3], 'status')).toBe(false);
    expect(isKanbanCardFieldCandidate(contentPieceFields[4], 'status')).toBe(false);
  });
});

describe('resolveDefaultKanbanCardFields', () => {
  it('derives indexed fields excluding the kanban group column', () => {
    expect(resolveDefaultKanbanCardFields(contentPieceFields, 'status')).toEqual([
      'publish_date',
      'channel',
    ]);
  });
});

describe('resolveEffectiveKanbanCardFields', () => {
  it('uses configured card_fields when present', () => {
    expect(
      resolveEffectiveKanbanCardFields(['channel'], contentPieceFields, 'status')
    ).toEqual(['channel']);
  });

  it('falls back to schema defaults when card_fields is empty', () => {
    expect(resolveEffectiveKanbanCardFields([], contentPieceFields, 'status')).toEqual([
      'publish_date',
      'channel',
    ]);
  });
});

describe('resolveKanbanSchemaFields', () => {
  it('narrows merged fields to the view entry_type_keys slice', () => {
    const entryTypes = [
      {
        id: 'et1',
        name: 'ContentPiece',
        form_schema: { fields: contentPieceFields },
      },
      {
        id: 'et2',
        name: 'Campaign',
        form_schema: {
          fields: [{ key: 'budget', name: 'Budget', type: 'number', index: true }],
        },
      },
    ] as EntryTypeNode[];
    const view = {
      id: 'v1',
      name: 'Board',
      type: 'kanban',
      track_id: 't1',
      entry_type_keys: ['content_piece'],
    } as SavedView;
    const narrowed = resolveKanbanSchemaFields(contentPieceFields, entryTypes, view, 'content_piece');
    expect(narrowed.map(f => f.key)).toEqual(contentPieceFields.map(f => f.key));
    expect(narrowed.some(f => f.key === 'budget')).toBe(false);
  });
});

describe('resolveKanbanCreateCustomFieldFallback', () => {
  it('defaults workflow field to the first kanban column on pipeline views', () => {
    const view = {
      id: 'v1',
      name: 'Pipeline',
      type: 'kanban',
      track_id: 't1',
      config: {
        group_by: 'custom_fields.status',
        kanban_columns: [
          { key: 'open', label: 'Open' },
          { key: 'paid', label: 'Paid' },
        ],
      },
    } as SavedView;
    expect(
      resolveKanbanCreateCustomFieldFallback(view, [
        { key: 'status', name: 'Status', type: 'select', enum: ['open', 'paid'] },
      ])
    ).toEqual({ status: 'open' });
  });
});

describe('shouldRouteKanbanQuickAddToCompose', () => {
  it('routes when indexed fields beyond the column are not seeded', () => {
    expect(
      shouldRouteKanbanQuickAddToCompose(contentPieceFields, 'status', {
        status: 'draft',
      })
    ).toBe(true);
  });

  it('allows quick-add when all indexed beyond-group fields are seeded', () => {
    expect(
      shouldRouteKanbanQuickAddToCompose(contentPieceFields, 'status', {
        status: 'draft',
        publish_date: '2026-06-01',
        channel: 'blog',
      })
    ).toBe(false);
  });

  it('allows quick-add for status-only boards with no extra indexed fields', () => {
    const taskFields = [
      { key: 'status', name: 'Status', type: 'select', index: true, enum: ['todo', 'done'] },
    ] as OperationalModelFieldSpec[];
    expect(
      shouldRouteKanbanQuickAddToCompose(taskFields, 'status', { status: 'todo' })
    ).toBe(false);
  });
});
