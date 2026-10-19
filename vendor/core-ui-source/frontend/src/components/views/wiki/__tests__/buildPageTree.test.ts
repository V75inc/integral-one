import { describe, expect, it } from 'vitest';
import type { Entry } from '../../../../types';
import {
  buildBreadcrumbPath,
  buildPageTree,
  filterEntriesBySearch,
  resolveParentEntryId,
} from '../buildPageTree';

function makeEntry(
  id: string,
  title: string,
  parentId?: string | null
): Entry {
  return {
    id,
    track_id: 't1',
    type: 'note',
    title,
    body: `Body of ${title}`,
    author_id: 'u1',
    created_at: '2026-01-01T00:00:00Z',
    custom_fields: parentId ? { parent: parentId } : {},
  };
}

describe('resolveParentEntryId', () => {
  it('reads parent id from custom_fields', () => {
    const entry = makeEntry('b', 'Child', 'a');
    expect(resolveParentEntryId(entry, 'parent')).toBe('a');
  });

  it('reads parent id from custom_fields.dotted path', () => {
    const entry = makeEntry('b', 'Child', 'a');
    expect(resolveParentEntryId(entry, 'custom_fields.parent')).toBe('a');
  });

  it('does not fall back from a null business relation to platform status', () => {
    const entry = {
      ...makeEntry('b', 'Child'),
      status: 'a',
      custom_fields: { status: null },
    };
    expect(resolveParentEntryId(entry, 'custom_fields.status')).toBeNull();
    expect(resolveParentEntryId(entry, 'status')).toBe('a');
  });
});

describe('buildPageTree', () => {
  it('builds multi-root tree with nested children', () => {
    const entries = [
      makeEntry('a', 'Root A'),
      makeEntry('b', 'Child B', 'a'),
      makeEntry('c', 'Child C', 'a'),
      makeEntry('d', 'Root D'),
    ];
    const { roots, byId } = buildPageTree(entries, 'parent');
    expect(roots).toHaveLength(2);
    expect(roots.map(r => r.entry.id).sort()).toEqual(['a', 'd']);
    const rootA = byId.get('a')!;
    expect(rootA.children).toHaveLength(2);
    expect(rootA.children.map(c => c.entry.id).sort()).toEqual(['b', 'c']);
  });

  it('sorts siblings by title ascending', () => {
    const entries = [
      makeEntry('a', 'Root'),
      makeEntry('z', 'Zebra', 'a'),
      makeEntry('m', 'Mango', 'a'),
    ];
    const { roots } = buildPageTree(entries, 'parent', {
      field: 'title',
      direction: 'asc',
    });
    expect(roots[0].children.map(c => c.entry.title)).toEqual(['Mango', 'Zebra']);
  });

  it('treats cyclic parent chain as root', () => {
    const entries = [
      makeEntry('a', 'A', 'b'),
      makeEntry('b', 'B', 'a'),
    ];
    const { roots } = buildPageTree(entries, 'parent');
    expect(roots).toHaveLength(2);
  });
});

describe('buildBreadcrumbPath', () => {
  it('returns root to leaf chain', () => {
    const entries = [
      makeEntry('a', 'Root'),
      makeEntry('b', 'Child', 'a'),
    ];
    const path = buildBreadcrumbPath('b', entries, 'parent');
    expect(path.map(e => e.id)).toEqual(['a', 'b']);
  });
});

describe('filterEntriesBySearch', () => {
  it('filters by title', () => {
    const entries = [
      makeEntry('1', 'Alpha'),
      makeEntry('2', 'Beta'),
    ];
    expect(filterEntriesBySearch(entries, 'alp', 'title')).toHaveLength(1);
  });
});
