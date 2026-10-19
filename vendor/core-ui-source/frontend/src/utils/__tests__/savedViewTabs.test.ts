import { describe, expect, it } from 'vitest';
import type { SavedView } from '../../types';
import { savedViewTabs } from '../savedViewTabs';

const view = (overrides: Partial<SavedView> = {}): SavedView => ({
  id: 'view-a', type: 'extension_view', name: 'Panel', track_id: 'track-a',
  config: { extension_view_key: 'panel-a' }, ...overrides,
});

describe('saved view tab identity', () => {
  it('preserves different extension keys even with identical names and slices', () => {
    const first = view();
    const second = view({ id: 'view-b', config: { extension_view_key: 'panel-b' } });
    expect(savedViewTabs([first, second])).toEqual([first, second]);
  });
  it('preserves named views with the same renderer', () => {
    const first = view({ type: 'table', name: 'All jobs', config: {} });
    const second = view({ id: 'view-b', type: 'table', name: 'Late jobs', config: {} });
    expect(savedViewTabs([first, second])).toEqual([first, second]);
  });
  it('preserves distinct filters and entry type slices', () => {
    const first = view({ type: 'table', config: { status: 'waiting' } });
    const filtered = view({ id: 'view-b', type: 'table', config: { status: 'done' } });
    const sliced = view({ id: 'view-c', type: 'table', entry_type_keys: ['job'] });
    expect(savedViewTabs([first, filtered, sliced])).toHaveLength(3);
  });
  it('prefers the default for equivalent definitions regardless of object key order', () => {
    const first = view({ config: { a: 1, nested: { b: 2, c: 3 } } });
    const preferred = view({ id: 'view-b', is_default: true, config: { nested: { c: 3, b: 2 }, a: 1 } });
    expect(savedViewTabs([first, preferred])).toEqual([preferred]);
  });
});

it('sorts saved tab positions without mutating the response', () => {
  const views = [{ id: 'a', name: 'A', type: 'feed', track_id: 't', config: { tab_order: 1 } },
    { id: 'b', name: 'B', type: 'table', track_id: 't', config: { tab_order: 0 } }];
  expect(savedViewTabs(views).map(view => view.id)).toEqual(['b', 'a']);
  expect(views.map(view => view.id)).toEqual(['a', 'b']);
});
