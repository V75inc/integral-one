/**
 * RelatedViewsSection rendering tests — Phase 3.1 Plan 03.1-04 Task 3 (ANC-06).
 *
 * Tests the RelatedViewsSection component (which EntryDetail.tsx mounts
 * inline after the comments thread) in isolation. Mocks ComposableViewSlot
 * so we exercise the routing logic (view-ref tokenization, resolver-prefix
 * walking, fail-soft slot skipping) without pulling the full view-render
 * pipeline + API client surface.
 *
 * Covers:
 *   - empty / missing related_views renders nothing
 *   - one ComposableViewSlot per declared related_view
 *   - resolver-prefixed view_ref (:anchored_track/board) routes to the
 *     resolved track id with viewKey='board'
 *   - bare view_ref (no `:` prefix) routes to currentTrackId
 *   - unresolved resolver token → slot skipped (no broken render)
 *   - bindings are forwarded to ComposableViewSlot with currentUser /
 *     entryId injected from the resolver context
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import type { ComposableViewSlotProps } from '../../views/ComposableViewSlot';

// Capture the props ComposableViewSlot is invoked with. The mock replaces
// the slot with a sentinel <div data-testid="slot"> that surfaces props
// via data-* attrs for easy assertion.
const slotCalls: ComposableViewSlotProps[] = [];
vi.mock('../../views/ComposableViewSlot', () => ({
  ComposableViewSlot: (props: ComposableViewSlotProps) => {
    slotCalls.push(props);
    return (
      <div
        data-testid="slot"
        data-track-id={props.trackId}
        data-view-key={props.viewKey}
        data-bindings={JSON.stringify(props.bindings ?? {})}
      />
    );
  },
}));

import { RelatedViewsSection, splitRelatedViewsByPosition } from '../RelatedViewsSection';

beforeEach(() => {
  slotCalls.length = 0;
});

afterEach(() => {
  // RTL doesn't auto-cleanup with vitest unless globals are on; explicit
  // cleanup here keeps screen.queryByTestId scoped per-test.
  cleanup();
});

describe('splitRelatedViewsByPosition', () => {
  it('puts position primary in primary and everything else in related', () => {
    const { primary, related } = splitRelatedViewsByPosition([
      { view: 'lines', bind: {}, position: 'primary' },
      { view: 'board', bind: {} },
      { view: 'feed', bind: {}, position: 'related' },
    ]);
    expect(primary.map(r => r.view)).toEqual(['lines']);
    expect(related.map(r => r.view)).toEqual(['board', 'feed']);
  });

  it('treats empty/missing as both empty', () => {
    expect(splitRelatedViewsByPosition(undefined)).toEqual({
      primary: [],
      related: [],
    });
    expect(splitRelatedViewsByPosition([])).toEqual({ primary: [], related: [] });
  });
});

describe('RelatedViewsSection — Phase 3.1 ANC-06', () => {
  it('renders nothing when entryTypeSpec is null', () => {
    const { container } = render(
      <RelatedViewsSection
        entry={{ id: 'e1' }}
        entryTypeSpec={null}
        user={{ id: 'u1' }}
        currentTrackId="t-current"
      />
    );
    expect(screen.queryByTestId('related-views-section')).toBeNull();
    expect(container.querySelectorAll('[data-testid="slot"]')).toHaveLength(0);
  });

  it('renders nothing when related_views is empty', () => {
    render(
      <RelatedViewsSection
        entry={{ id: 'e1' }}
        entryTypeSpec={{ related_views: [] }}
        user={{ id: 'u1' }}
        currentTrackId="t-current"
      />
    );
    expect(screen.queryByTestId('related-views-section')).toBeNull();
  });

  it('renders one ComposableViewSlot per related_view declaration', () => {
    render(
      <RelatedViewsSection
        entry={{ id: 'e1' }}
        entryTypeSpec={{
          related_views: [
            { view: 'board', bind: {} },
            { view: 'feed', bind: {} },
          ],
        }}
        user={{ id: 'u1' }}
        currentTrackId="t-current"
      />
    );
    expect(screen.getByTestId('related-views-section')).toBeInTheDocument();
    expect(screen.getAllByTestId('slot')).toHaveLength(2);
  });

  it('bare view_ref (no : prefix) routes to currentTrackId', () => {
    render(
      <RelatedViewsSection
        entry={{ id: 'e1' }}
        entryTypeSpec={{
          related_views: [{ view: 'board', bind: {} }],
        }}
        user={{ id: 'u1' }}
        currentTrackId="t-current"
      />
    );
    expect(slotCalls).toHaveLength(1);
    expect(slotCalls[0].trackId).toBe('t-current');
    expect(slotCalls[0].viewKey).toBe('board');
  });

  it(':anchored_track prefix routes to resolved anchoredTrackId', () => {
    render(
      <RelatedViewsSection
        entry={{ id: 'e1' }}
        entryTypeSpec={{
          related_views: [{ view: ':anchored_track/board', bind: {} }],
        }}
        user={{ id: 'u1' }}
        currentTrackId="t-current"
        anchoredTrackId="t-anchored"
      />
    );
    expect(slotCalls).toHaveLength(1);
    expect(slotCalls[0].trackId).toBe('t-anchored');
    expect(slotCalls[0].viewKey).toBe('board');
  });

  it('unresolved :anchored_track (no anchor edge) skips the slot', () => {
    render(
      <RelatedViewsSection
        entry={{ id: 'e1' }}
        entryTypeSpec={{
          related_views: [{ view: ':anchored_track/board', bind: {} }],
        }}
        user={{ id: 'u1' }}
        currentTrackId="t-current"
        // anchoredTrackId intentionally omitted — :anchored_track resolves
        // to null; the slot should be skipped (fail-soft).
      />
    );
    expect(screen.queryByTestId('related-views-section')).toBeNull();
    expect(slotCalls).toHaveLength(0);
  });

  it('forwards bindings with currentUser + entryId injected', () => {
    render(
      <RelatedViewsSection
        entry={{ id: 'e-42' }}
        entryTypeSpec={{
          related_views: [
            { view: 'board', bind: { customKey: 'customVal' } },
          ],
        }}
        user={{ id: 'u-99' }}
        currentTrackId="t-current"
      />
    );
    expect(slotCalls[0].bindings).toEqual({
      customKey: 'customVal',
      currentUser: 'u-99',
      entryId: 'e-42',
      __refreshKey: 0,
      onActionComplete: expect.any(Function),
    });
  });

  it('forwards appId so embedded extension views can load their package', () => {
    render(
      <RelatedViewsSection
        entry={{ id: 'e-42' }}
        entryTypeSpec={{
          related_views: [{ view: 'opening_apply_link', bind: {} }],
        }}
        user={{ id: 'u-99' }}
        currentTrackId="t-current"
        appId="app-recruitment"
      />
    );
    expect(slotCalls[0].bindings?.appId).toBe('app-recruitment');
  });

  it('mixed declarations: one resolves, one skipped → only the resolved one renders', () => {
    render(
      <RelatedViewsSection
        entry={{ id: 'e1' }}
        entryTypeSpec={{
          related_views: [
            { view: 'board', bind: {} },
            { view: ':anchored_track/feed', bind: {} },
          ],
        }}
        user={{ id: 'u1' }}
        currentTrackId="t-current"
        // No anchoredTrackId — :anchored_track/feed should be skipped.
      />
    );
    expect(slotCalls).toHaveLength(1);
    expect(slotCalls[0].trackId).toBe('t-current');
    expect(slotCalls[0].viewKey).toBe('board');
  });

  it('forwards interactive callbacks to ComposableViewSlot', () => {
    const onEntryOpen = vi.fn();
    const onEntryCreate = vi.fn();
    render(
      <RelatedViewsSection
        entry={{ id: 'e1' }}
        entryTypeSpec={{ related_views: [{ view: 'tasks-board', bind: {} }] }}
        user={{ id: 'u1' }}
        currentTrackId="t-current"
        anchoredTrackId="t-anchored"
        onEntryOpen={onEntryOpen}
        onEntryCreate={onEntryCreate}
        isEditor
      />
    );
    expect(slotCalls[0].trackId).toBe('t-current');
    expect(slotCalls[0].onEntryOpen).toBe(onEntryOpen);
    expect(slotCalls[0].onEntryCreate).toBe(onEntryCreate);
    expect(slotCalls[0].isEditor).toBe(true);
  });

  it('primary placement: custom testId, no Related heading', () => {
    render(
      <RelatedViewsSection
        entry={{ id: 'e1' }}
        entryTypeSpec={{
          related_views: [{ view: 'lines', bind: {}, position: 'primary' }],
        }}
        user={{ id: 'u1' }}
        currentTrackId="t-current"
        heading={null}
        testId="primary-related-views-section"
      />
    );
    expect(screen.getByTestId('primary-related-views-section')).toBeInTheDocument();
    expect(screen.queryByText('Related')).toBeNull();
    expect(screen.getAllByTestId('slot')).toHaveLength(1);
  });

  it('empty primary list renders nothing', () => {
    render(
      <RelatedViewsSection
        entry={{ id: 'e1' }}
        entryTypeSpec={{ related_views: [] }}
        user={{ id: 'u1' }}
        currentTrackId="t-current"
        heading={null}
        testId="primary-related-views-section"
      />
    );
    expect(screen.queryByTestId('primary-related-views-section')).toBeNull();
  });
});
