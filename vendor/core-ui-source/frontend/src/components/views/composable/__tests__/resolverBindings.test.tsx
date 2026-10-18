/**
 * Composable meta-widgets' resolver-bindings wiring.
 *
 * The ``:entry_id``/``:current_user`` resolver contract (see
 * ``templateVarResolvers.ts`` + ``applyFilters``'s resolver hook, both
 * already covered by ``templateVarResolvers.test.ts``) sat unused by every
 * composable widget: each called ``applyFilters(entries, filterRules)``
 * with no context argument, so a manifest filter rule like
 * ``{field: 'pay_run', op: 'eq', value: ':entry_id'}`` — the shape needed
 * to embed "Payslips for this Pay Run" on a Pay Run's own detail page —
 * always resolved to null and matched nothing. ``ComposableGrid`` didn't
 * even read a ``filter`` config at all.
 *
 * This test proves ``resolverContextFromBindings`` + each widget's
 * ``applyFilters`` call now actually resolve ``config.__bindings`` (the
 * namespace ``ComposableViewSlot`` forwards a host entry's id/user into,
 * per ``FormRegionWidget``/``ChartRegionWidget``'s existing convention)
 * into a live filter — through the real widget components, with
 * ``EntryCard`` stubbed (its own rendering/providers aren't under test
 * here, mirroring how ``LayoutContainerWidget.test.tsx`` stubs
 * ``ComposableViewSlot`` to isolate the piece actually being verified).
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import type { Entry, SavedView } from '../../../../types';
import { resolverContextFromBindings } from '../utils';

vi.mock('../../../entries/EntryCard', () => ({
  EntryCard: ({ entry }: { entry: Entry }) => (
    <div data-testid="entry-card">{entry.id}</div>
  ),
}));

import { ComposableList } from '../ComposableList';
import { ComposableBoard } from '../ComposableBoard';
import { ComposableTimeline } from '../ComposableTimeline';
import { ComposableGrid } from '../ComposableGrid';

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('resolverContextFromBindings', () => {
  it('maps __bindings.entryId/currentUser to the resolver context shape', () => {
    expect(
      resolverContextFromBindings({
        __bindings: { entryId: 'pay-run-1', currentUser: 'user-9' },
      })
    ).toEqual({ entryId: 'pay-run-1', userId: 'user-9', anchoredTrackId: undefined });
  });

  it('tolerates missing/undefined config', () => {
    expect(resolverContextFromBindings(undefined)).toEqual({
      entryId: undefined,
      userId: undefined,
      anchoredTrackId: undefined,
    });
  });
});

const payslips = [
  { id: 'ps-1', custom_fields: { pay_run: 'pay-run-1', status: 'open' } },
  { id: 'ps-2', custom_fields: { pay_run: 'pay-run-2', status: 'open' } },
] as unknown as Entry[];

function payRunFilterView(config: Record<string, unknown>): SavedView {
  return {
    id: 'view-1',
    name: 'Payslips',
    type: 'composable_list',
    track_id: 'payslips-track',
    config,
  } as SavedView;
}

const ENTRY_ID_RULE = { field: 'pay_run', op: 'eq' as const, value: ':entry_id' };
const noop = () => {};

describe('ComposableList — :entry_id filter via bindings', () => {
  it('shows only the payslip whose pay_run matches the bound host entry', () => {
    render(
      <ComposableList
        view={payRunFilterView({
          filter: { rules: [ENTRY_ID_RULE] },
          __bindings: { entryId: 'pay-run-1' },
        })}
        entries={payslips}
        isLoading={false}
        onEntryOpen={noop}
      />
    );
    const cards = screen.getAllByTestId('entry-card');
    expect(cards).toHaveLength(1);
    expect(cards[0]).toHaveTextContent('ps-1');
  });

  it('matches nothing when the host binding is absent (fail-soft, not a crash)', () => {
    render(
      <ComposableList
        view={payRunFilterView({ filter: { rules: [ENTRY_ID_RULE] } })}
        entries={payslips}
        isLoading={false}
        onEntryOpen={noop}
      />
    );
    expect(screen.getByText(/No entries match this view/i)).toBeInTheDocument();
    expect(screen.queryByTestId('entry-card')).not.toBeInTheDocument();
  });
});

describe('ComposableBoard — :entry_id filter via bindings', () => {
  it('filters board entries to the bound pay run before columning', () => {
    render(
      <ComposableBoard
        view={payRunFilterView({
          group_by: 'status',
          filter: { rules: [ENTRY_ID_RULE] },
          __bindings: { entryId: 'pay-run-2' },
        })}
        entries={payslips}
        isLoading={false}
        onEntryOpen={noop}
      />
    );
    const cards = screen.getAllByTestId('entry-card');
    expect(cards).toHaveLength(1);
    expect(cards[0]).toHaveTextContent('ps-2');
  });
});

describe('ComposableTimeline — :entry_id filter via bindings', () => {
  it('excludes entries whose pay_run does not match the bound host entry', () => {
    const dated = [
      { id: 'ps-1', custom_fields: { pay_run: 'pay-run-1', created_at: '2026-01-01' } },
      { id: 'ps-2', custom_fields: { pay_run: 'pay-run-2', created_at: '2026-01-02' } },
    ] as unknown as Entry[];
    render(
      <ComposableTimeline
        view={payRunFilterView({
          date_field: 'created_at',
          filter: { rules: [ENTRY_ID_RULE] },
          __bindings: { entryId: 'pay-run-1' },
        })}
        entries={dated}
        isLoading={false}
        onEntryOpen={noop}
      />
    );
    const cards = screen.getAllByTestId('entry-card');
    expect(cards).toHaveLength(1);
    expect(cards[0]).toHaveTextContent('ps-1');
  });
});

describe('ComposableGrid — filter config support (previously absent)', () => {
  it('now accepts a filter.rules config and resolves :entry_id against bindings', () => {
    render(
      <ComposableGrid
        view={payRunFilterView({
          filter: { rules: [ENTRY_ID_RULE] },
          __bindings: { entryId: 'nonexistent-pay-run' },
        })}
        entries={payslips}
        isLoading={false}
        onEntryOpen={noop}
      />
    );
    // Previously ComposableGrid always called applyFilters(entries, []) —
    // i.e. every entry, unfiltered, regardless of config. Now a filter
    // that matches nothing correctly renders the empty state.
    expect(screen.getByText(/No entries match this view/i)).toBeInTheDocument();
    expect(screen.queryByTestId('entry-card')).not.toBeInTheDocument();
  });

  it('still renders unfiltered entries when no filter config is given (back-compat)', () => {
    render(
      <ComposableGrid
        view={payRunFilterView({})}
        entries={payslips}
        isLoading={false}
        onEntryOpen={noop}
      />
    );
    expect(screen.getAllByTestId('entry-card')).toHaveLength(2);
  });
});
