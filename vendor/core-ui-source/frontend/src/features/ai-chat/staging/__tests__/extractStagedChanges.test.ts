import { describe, expect, it } from 'vitest';
import { extractStagedChangesFromParts } from '../extractStagedChanges';
import type { StagedChange } from '../types';

const sample: StagedChange = {
  _kind: 'staged_change',
  token: 'tok-1',
  kind: 'create_entry',
  summary: 'Create entry',
  diff_human: 'Create entry',
  diff_machine: { op: 'create_entry' },
  state: 'consumed',
  created_at: '2026-01-01T00:00:00Z',
  expires_at: '2026-01-01T00:10:00Z',
  autonomy_grant_used: false,
};

describe('extractStagedChangesFromParts', () => {
  it('parses JSON-string tool results and dedupes tokens', () => {
    const parts = [
      {
        type: 'tool-call',
        result: JSON.stringify(sample),
      },
      {
        type: 'tool-call',
        result: { ...sample },
      },
    ];
    const out = extractStagedChangesFromParts(undefined, parts);
    expect(out).toHaveLength(1);
    expect(out[0]?.token).toBe('tok-1');
  });

  it('ignores errored tool calls', () => {
    const parts = [
      {
        type: 'tool-call',
        isError: true,
        result: sample,
      },
    ];
    expect(extractStagedChangesFromParts(undefined, parts)).toHaveLength(0);
  });
});

describe('rollback button visibility inputs', () => {
  it('blessed tokens are pre-consume undo candidates', () => {
    const blessed = { ...sample, state: 'blessed' as const };
    expect(blessed.state).toBe('blessed');
    expect(blessed.rolled_back_at).toBeUndefined();
  });

  it('consumed tokens without rolled_back_at are post-consume candidates', () => {
    expect(sample.state).toBe('consumed');
    expect(sample.rolled_back_at).toBeUndefined();
  });
});
