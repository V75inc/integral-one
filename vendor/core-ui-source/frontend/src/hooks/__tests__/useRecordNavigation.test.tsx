import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { Entry } from '../../types';
import { useRecordNavigation, useRecordNavigationDraftGuard } from '../useRecordNavigation';
const record = (id: string) => ({ id, track_id: 'track' } as Entry);
const defaults = () => ({
  enabled: true, contextKey: 'list', entryId: 'a', entries: [record('a'), record('b')],
  page: 1, pageCount: 2, loading: false,
  loadPage: vi.fn().mockResolvedValue([record('c'), record('d')]),
  readEntry: vi.fn(async (id: string) => record(id)), openEntry: vi.fn(), onError: vi.fn(),
});
describe('ordered record navigation', () => {
  it('follows displayed order and rechecks access before opening', async () => {
    const props = defaults();
    const { result } = renderHook(() => useRecordNavigation(props));
    expect(result.current?.canPrevious).toBe(false);
    act(() => result.current?.next());
    await waitFor(() => expect(props.openEntry).toHaveBeenCalledWith(record('b'), 1));
    expect(props.readEntry).toHaveBeenCalledWith('b');
    expect(props.loadPage).not.toHaveBeenCalled();
  });
  it('crosses page boundaries without changing the list until a readable target exists', async () => {
    const props = { ...defaults(), entryId: 'b' };
    const { result } = renderHook(() => useRecordNavigation(props));
    act(() => result.current?.next());
    await waitFor(() => expect(props.openEntry).toHaveBeenCalledWith(record('c'), 2));
    expect(props.loadPage).toHaveBeenCalledWith(2);
  });
  it('uses the last visible record of the previous page', async () => {
    const props = { ...defaults(), page: 2, entryId: 'a' };
    const { result } = renderHook(() => useRecordNavigation(props));
    act(() => result.current?.previous());
    await waitFor(() => expect(props.openEntry).toHaveBeenCalledWith(record('d'), 1));
  });
  it('keeps current record on permission denial', async () => {
    const props = defaults(); props.readEntry.mockRejectedValue(new Error('Forbidden'));
    const { result } = renderHook(() => useRecordNavigation(props));
    act(() => result.current?.next());
    await waitFor(() => expect(props.onError).toHaveBeenCalled());
    expect(props.openEntry).not.toHaveBeenCalled();
  });
  it('ignores repeated clicks and a late response after close or context change', async () => {
    let resolve!: (entry: Entry) => void;
    const props = defaults(); props.readEntry.mockImplementation(() => new Promise(r => { resolve = r; }));
    const { result, rerender } = renderHook(p => useRecordNavigation(p), { initialProps: props });
    act(() => { result.current?.next(); result.current?.next(); });
    expect(props.readEntry).toHaveBeenCalledTimes(1);
    rerender({ ...props, enabled: false });
    await act(async () => resolve(record('b')));
    expect(props.openEntry).not.toHaveBeenCalled();
  });
  it('does not infer an order for a deep-linked record absent from the list', () => {
    const { result } = renderHook(() => useRecordNavigation({ ...defaults(), entryId: 'outside' }));
    expect(result.current).toBeUndefined();
  });
  it('skips filtered empty pages but bounds reads', async () => {
    const props = { ...defaults(), entryId: 'b', pageCount: 100 };
    props.loadPage.mockResolvedValue([]);
    const { result } = renderHook(() => useRecordNavigation(props));
    act(() => result.current?.next());
    await waitFor(() => expect(props.onError).toHaveBeenCalled());
    expect(props.loadPage).toHaveBeenCalledTimes(10);
    expect(props.openEntry).not.toHaveBeenCalled();
  });
  it('cancels late navigation after changing workspace/filter context', async () => {
    let resolve!: (entry: Entry) => void;
    const props = defaults(); props.readEntry.mockImplementation(() => new Promise(r => { resolve = r; }));
    const { result, rerender } = renderHook(p => useRecordNavigation(p), { initialProps: props });
    act(() => result.current?.next());
    rerender({ ...props, contextKey: 'different-workspace-filter-sort' });
    await act(async () => resolve(record('b')));
    expect(props.openEntry).not.toHaveBeenCalled();
  });
  it('cancels late navigation after unmount', async () => {
    let resolve!: (entry: Entry) => void;
    const props = defaults(); props.readEntry.mockImplementation(() => new Promise(r => { resolve = r; }));
    const { result, unmount } = renderHook(() => useRecordNavigation(props));
    act(() => result.current?.next()); unmount();
    await act(async () => resolve(record('b')));
    expect(props.openEntry).not.toHaveBeenCalled();
  });
  it('does not navigate placeholder data while a list page loads', () => {
    const props = { ...defaults(), loading: true };
    const { result } = renderHook(() => useRecordNavigation(props));
    expect(result.current?.canNext).toBe(false);
    act(() => result.current?.next());
    expect(props.readEntry).not.toHaveBeenCalled();
    expect(props.loadPage).not.toHaveBeenCalled();
  });
  it('skips an empty filtered page to the first matching record', async () => {
    const props = { ...defaults(), entryId: 'b', pageCount: 3 };
    props.loadPage.mockResolvedValueOnce([]).mockResolvedValueOnce([record('match')]);
    const { result } = renderHook(() => useRecordNavigation(props));
    act(() => result.current?.next());
    await waitFor(() => expect(props.openEntry).toHaveBeenCalledWith(record('match'), 3));
  });

  it('preserves a draft started during a pending record read by cancelling the transition', async () => {
    let resolve!: (entry: Entry) => void;
    const props = defaults(); props.readEntry.mockImplementation(() => new Promise(r => { resolve = r; }));
    const { result, rerender } = renderHook(({ draftOpen }) => {
      const navigation = useRecordNavigation(props);
      useRecordNavigationDraftGuard(navigation, draftOpen);
      return navigation;
    }, { initialProps: { draftOpen: false } });
    act(() => result.current?.next());
    expect(result.current?.busy).toBe(true);
    rerender({ draftOpen: true });
    await act(async () => resolve(record('b')));
    expect(props.openEntry).not.toHaveBeenCalled();
    expect(result.current?.busy).toBe(false);
  });

});
