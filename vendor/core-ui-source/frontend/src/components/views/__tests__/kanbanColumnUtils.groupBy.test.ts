import { describe, it, expect } from 'vitest';
import {
  buildKanbanColumnsForGroupField,
  normalizeKanbanCardFieldKey,
  resolveEffectiveKanbanCardFields,
  resolveKanbanGroupByEligibleFields,
} from '../kanbanColumnUtils';
import type { OperationalModelFieldSpec, Entry } from '../../../types';

const taskFields: OperationalModelFieldSpec[] = [
  { key: 'bucket', name: 'Bucket', type: 'select', enum: ['backlog', 'done'] },
  { key: 'status', name: 'Status', type: 'select', enum: ['todo', 'done'] },
  { key: 'assignee', name: 'Assignee', type: 'member' },
  { key: 'checklist', name: 'Checklist', type: 'json' },
];

describe('kanbanColumnUtils group-by helpers', () => {
  it('normalizes manifest card_fields paths', () => {
    expect(normalizeKanbanCardFieldKey('custom_fields.assignee')).toBe('assignee');
    expect(
      resolveEffectiveKanbanCardFields(
        ['custom_fields.assignee', 'custom_fields.status'],
        taskFields,
        'bucket'
      )
    ).toEqual(['assignee', 'status']);
  });

  it('lists select and member fields as group-by options', () => {
    const eligible = resolveKanbanGroupByEligibleFields(taskFields);
    expect(eligible.map(f => f.key)).toEqual(['bucket', 'status', 'assignee']);
  });

  it('builds enum columns for bucket grouping', () => {
    const cols = buildKanbanColumnsForGroupField(
      'custom_fields.bucket',
      taskFields,
      [
        { key: 'backlog', label: 'Backlog' },
        { key: 'done', label: 'Done' },
      ],
      []
    );
    expect(cols.map(c => c.key)).toEqual(['backlog', 'done']);
  });

  it('builds dynamic member columns from entries', () => {
    const entries = [
      { id: 'e1', custom_fields: { assignee: 'u-abc' } },
      { id: 'e2', custom_fields: { assignee: 'u-def' } },
    ] as unknown as Entry[];
    const cols = buildKanbanColumnsForGroupField(
      'custom_fields.assignee',
      taskFields,
      [],
      entries
    );
    expect(cols.map(c => c.key).sort()).toEqual(['u-abc', 'u-def']);
  });

  it('uses member label resolver for assignee column headers', () => {
    const entries = [
      { id: 'e1', custom_fields: { assignee: 'u-abc' } },
    ] as unknown as Entry[];
    const cols = buildKanbanColumnsForGroupField(
      'custom_fields.assignee',
      taskFields,
      [],
      entries,
      id => (id === 'u-abc' ? 'Alex Rivera' : undefined)
    );
    expect(cols).toEqual([{ key: 'u-abc', label: 'Alex Rivera' }]);
  });

  it('keeps renamed column labels when resolver returns undefined', () => {
    const entries = [
      { id: 'e1', custom_fields: { assignee: 'u-abc' } },
    ] as unknown as Entry[];
    const cols = buildKanbanColumnsForGroupField(
      'custom_fields.assignee',
      taskFields,
      [{ key: 'u-abc', label: 'Eng lead' }],
      entries,
      () => undefined
    );
    expect(cols).toEqual([{ key: 'u-abc', label: 'Eng lead' }]);
  });

  it('lists sprint relation in group-by options and builds sprint columns', () => {
    const fieldsWithSprint: OperationalModelFieldSpec[] = [
      ...taskFields,
      {
        key: 'sprint',
        name: 'Sprint',
        type: 'relation',
        relation: { target: 'entry', target_entry_types: ['sprint'], many: false },
      },
    ];
    const eligible = resolveKanbanGroupByEligibleFields(fieldsWithSprint);
    expect(eligible.map(f => f.key)).toContain('sprint');

    const entries = [
      { id: 't1', custom_fields: { sprint: 'sprint-1' } },
      { id: 't2', custom_fields: { sprint: 'sprint-2' } },
    ] as unknown as Entry[];

    const cols = buildKanbanColumnsForGroupField(
      'custom_fields.sprint',
      fieldsWithSprint,
      [],
      entries,
      undefined,
      id => (id === 'sprint-1' ? 'Sprint 1 — Launch' : undefined)
    );

    expect(cols).toEqual([
      { key: 'sprint-1', label: 'Sprint 1 — Launch' },
      { key: 'sprint-2', label: 'sprint-2' },
    ]);
  });
});


it('recovers a removed column when a loaded record still uses its status', () => {
  const entries = [{ id: 'e1', custom_fields: { status: 'done' } }] as unknown as Entry[];
  const columns = buildKanbanColumnsForGroupField('custom_fields.status', taskFields,
    [{ key: 'todo', label: 'To Do' }], entries);
  expect(columns.map(column => column.key)).toEqual(['todo', 'done']);
});
