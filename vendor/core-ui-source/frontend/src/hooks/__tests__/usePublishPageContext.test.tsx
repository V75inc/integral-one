/**
 * Publishing page context is a lifecycle problem, not a data problem.
 *
 * The payload is easy; getting the effect wrong is not. A missing cleanup
 * leaks the previous page's context into the next one, so the agent answers
 * "what am I looking at" with a screen the user already left — confidently and
 * wrongly, which is worse than not knowing. A dependency array that compares
 * object identity re-publishes on every render instead.
 *
 * These pin both, so pages only have to describe themselves.
 */

import { describe, expect, it, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';

const setPageContext = vi.fn();
const clearPageContext = vi.fn();

vi.mock('../../context/ChatPageFocusContext', () => ({
  useChatPageFocus: () => ({ setPageContext, clearPageContext }),
}));

import { usePublishPageContext } from '../usePublishPageContext';

beforeEach(() => {
  setPageContext.mockClear();
  clearPageContext.mockClear();
});

describe('usePublishPageContext', () => {
  it('publishes what the page is showing', () => {
    renderHook(() =>
      usePublishPageContext({ pageKind: 'tracks_list', metadata: { app_count: 2 } }),
    );

    expect(setPageContext).toHaveBeenCalledWith({
      pageKind: 'tracks_list',
      metadata: { app_count: 2 },
    });
  });

  it('clears on unmount so the next page does not inherit it', () => {
    // The failure this prevents: navigate from a track to settings, ask "what
    // am I looking at", and get told about the track.
    const { unmount } = renderHook(() =>
      usePublishPageContext({ pageKind: 'track_detail' }),
    );
    expect(clearPageContext).not.toHaveBeenCalled();

    unmount();
    expect(clearPageContext).toHaveBeenCalled();
  });

  it('clears rather than publishing a half-loaded page', () => {
    // Pages pass null while the id or the query has not resolved.
    renderHook(() => usePublishPageContext(null));

    expect(setPageContext).not.toHaveBeenCalled();
    expect(clearPageContext).toHaveBeenCalled();
  });

  it('does not republish when only the object identity changed', () => {
    // Callers build the payload inline, so identity churns every render. A
    // naive dep array would re-publish on each keystroke of an unrelated input.
    const { rerender } = renderHook(
      ({ n }: { n: number }) =>
        usePublishPageContext({ pageKind: 'tracks_list', metadata: { count: n } }),
      { initialProps: { n: 1 } },
    );
    expect(setPageContext).toHaveBeenCalledTimes(1);

    rerender({ n: 1 });
    expect(setPageContext).toHaveBeenCalledTimes(1);

    rerender({ n: 2 });
    expect(setPageContext).toHaveBeenCalledTimes(2);
    expect(setPageContext).toHaveBeenLastCalledWith({
      pageKind: 'tracks_list',
      metadata: { count: 2 },
    });
  });
});
