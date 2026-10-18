import { describe, expect, it, vi } from 'vitest';
import { entryTypesApi } from '../../../../api/entryTypes';
import {
  getWikiViewConstraints,
  resolveWikiPageEntryType,
  resolveWikiPageEntryTypeForTrack,
} from '../resolveWikiPageEntryType';
import type { EntryTypeNode, SavedView } from '../../../../types';

describe('resolveWikiPageEntryType', () => {
  it('prefers page when listed on the view', () => {
    const view = {
      id: 'v1',
      name: 'Pages',
      type: 'wiki',
      track_id: 't1',
      entry_type_keys: ['page'],
      default_entry_type_key: 'page',
    } as SavedView;
    expect(resolveWikiPageEntryType(view)).toBe('page');
  });

  it('reads constraints from view config when node fields are empty', () => {
    const view = {
      id: 'v1',
      name: 'Pages',
      type: 'wiki',
      track_id: 't1',
      config: {
        entry_type_keys: ['page'],
        default_entry_type: 'page',
        parent_field: 'parent',
      },
    } as SavedView;
    expect(getWikiViewConstraints(view).entryTypeKeys).toEqual(['page']);
    expect(resolveWikiPageEntryType(view)).toBe('page');
  });

  it('does not fall back to track note default when view is unconstrained', () => {
    const view = {
      id: 'v1',
      name: 'Pages',
      type: 'wiki',
      track_id: 't1',
    } as SavedView;
    expect(resolveWikiPageEntryType(view)).toBe('page');
  });

  it('creates pages with the type that owns the parent relation', async () => {
    const view = {
      id: 'v1', name: 'Wiki', type: 'wiki', track_id: 't1',
    } as SavedView;
    const list = vi.spyOn(entryTypesApi, 'list').mockResolvedValueOnce([
      { name: 'Page', form_schema: { fields: [] } },
      { name: 'Article', form_schema: { fields: [{ key: 'parent', type: 'relation' }] } },
    ] as EntryTypeNode[]);
    expect(await resolveWikiPageEntryTypeForTrack('t1', view, 'parent')).toBe('article');
    list.mockRestore();
  });
});
