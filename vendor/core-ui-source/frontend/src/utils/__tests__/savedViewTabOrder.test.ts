import { describe, expect, it } from 'vitest';
import type { SavedView } from '../../types';
import { orderSavedViews, tabOrderChanges } from '../savedViewTabs';

const v = (id: string, config: Record<string, unknown> = {}) => ({ id, name: id, type: 'feed', config }) as unknown as SavedView;
const ids = (views: SavedView[]) => views.map(x => x.id);

describe('tab order', () => {
  it("uses the App's declared order when nobody has reordered", () => {
    const views = [v('a', { default_tab_order: 2 }), v('b', { default_tab_order: 0 }), v('c', { default_tab_order: 1 })];
    expect(ids(orderSavedViews(views))).toEqual(['b', 'c', 'a']);
  });
  it('lets a person order win over the App order', () => {
    const views = [v('a', { default_tab_order: 0, tab_order: 2 }), v('b', { default_tab_order: 1, tab_order: 0 }), v('c', { default_tab_order: 2, tab_order: 1 })];
    expect(ids(orderSavedViews(views))).toEqual(['b', 'c', 'a']);
  });
  it('falls back to the order the views arrived in', () => {
    expect(ids(orderSavedViews([v('x'), v('y'), v('z')]))).toEqual(['x', 'y', 'z']);
  });
  it('gives every tab a stored position the first time anyone reorders', () => {
    const views = [v('a', { default_tab_order: 0 }), v('b', { default_tab_order: 1 }), v('c', { default_tab_order: 2 })];
    const changes = tabOrderChanges(views, ['c', 'a', 'b']);
    expect(changes.map(c => [c.view.id, c.tabOrder])).toEqual([['c', 0], ['a', 1], ['b', 2]]);
  });
  it('writes only the tabs that moved once an order is stored', () => {
    const views = [v('a', { tab_order: 0 }), v('b', { tab_order: 1 }), v('c', { tab_order: 2 })];
    expect(tabOrderChanges(views, ['a', 'b', 'c'])).toEqual([]);
    expect(tabOrderChanges(views, ['b', 'a', 'c']).map(c => c.view.id)).toEqual(['b', 'a']);
  });
  it('ignores ids that are not tabs', () => {
    expect(tabOrderChanges([v('a', { tab_order: 0 })], ['ghost', 'a']).map(c => c.view.id)).toEqual(['a']);
  });
});

describe('tab order from the App (defaults.tabs.order)', () => {
  const keyed = (id: string, key: string, config: Record<string, unknown> = {}) => v(id, { _manifest_view_key: key, ...config });

  it('puts the listed views first, in the listed order', () => {
    const views = [keyed('1', 'a'), keyed('2', 'b'), keyed('3', 'c')];
    expect(ids(orderSavedViews(views, ['c', 'a']))).toEqual(['3', '1', '2']);
  });
  it('lets the views the list does not name follow in their declared order', () => {
    const views = [keyed('1', 'a', { default_tab_order: 2 }), keyed('2', 'b', { default_tab_order: 0 }), keyed('3', 'c', { default_tab_order: 1 })];
    expect(ids(orderSavedViews(views, ['c']))).toEqual(['3', '2', '1']);
  });
  it('still lets a person order win over the App list', () => {
    const views = [keyed('1', 'a', { tab_order: 1 }), keyed('2', 'b', { tab_order: 0 })];
    expect(ids(orderSavedViews(views, ['a', 'b']))).toEqual(['2', '1']);
  });
  it('behaves as before when the App gives no list', () => {
    const views = [keyed('1', 'a', { default_tab_order: 1 }), keyed('2', 'b', { default_tab_order: 0 })];
    expect(ids(orderSavedViews(views))).toEqual(['2', '1']);
    expect(ids(orderSavedViews(views, []))).toEqual(['2', '1']);
  });
  it('ignores a key that matches no view', () => {
    const views = [keyed('1', 'a'), keyed('2', 'b')];
    expect(ids(orderSavedViews(views, ['ghost', 'b']))).toEqual(['2', '1']);
  });
});
