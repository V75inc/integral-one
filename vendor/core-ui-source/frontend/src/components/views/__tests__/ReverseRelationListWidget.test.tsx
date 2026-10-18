import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import type { Entry, SavedView } from '../../../types';

const mockListRelated = vi.fn();

vi.mock('../../../api', async importOriginal => {
  const actual = await importOriginal<typeof import('../../../api')>();
  return {
    ...actual,
    entriesApi: { ...actual.entriesApi, listRelated: (id: string, rel: string) => mockListRelated(id, rel) },
  };
});

vi.mock('../../entries/EntryCard', () => ({
  EntryCard: ({ entry }: { entry: Entry }) => <div data-testid="entry-card">{entry.id}</div>,
}));

import { ReverseRelationListWidget } from '../ReverseRelationListWidget';

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function view(config: Record<string, unknown>): SavedView {
  return {
    id: 'v-1',
    name: 'Payslips',
    type: 'reverse_relation_list',
    track_id: 'pay-runs-track',
    config,
  } as SavedView;
}

const noop = () => {};

describe('ReverseRelationListWidget', () => {
  it('fetches by relation + bound host entry id and renders results', async () => {
    mockListRelated.mockResolvedValue({
      entries: [
        { id: 'ps-1', custom_fields: {} },
        { id: 'ps-2', custom_fields: {} },
      ] as unknown as Entry[],
      nextCursor: null,
      hasMore: false,
    });

    render(
      <ReverseRelationListWidget
        view={view({ relation: 'pay_run', title: 'Payslips', __bindings: { entryId: 'pay-run-1' } })}
        entries={[]}
        isLoading={false}
        onEntryOpen={noop}
      />
    );

    await waitFor(() => {
      expect(mockListRelated).toHaveBeenCalledWith('pay-run-1', 'pay_run');
    });
    await waitFor(() => {
      expect(screen.getAllByTestId('entry-card')).toHaveLength(2);
    });
    expect(screen.getByText(/Payslips/)).toBeInTheDocument();
  });

  it('shows an empty state and does not fetch when the host binding is missing', async () => {
    render(
      <ReverseRelationListWidget
        view={view({ relation: 'pay_run' })}
        entries={[]}
        isLoading={false}
        onEntryOpen={noop}
      />
    );

    await waitFor(() => {
      expect(screen.getByText(/No related records yet/i)).toBeInTheDocument();
    });
    expect(mockListRelated).not.toHaveBeenCalled();
  });

  it('surfaces a failure without crashing when the fetch rejects', async () => {
    mockListRelated.mockRejectedValue(new Error('boom'));

    render(
      <ReverseRelationListWidget
        view={view({ relation: 'pay_run', __bindings: { entryId: 'pay-run-1' } })}
        entries={[]}
        isLoading={false}
        onEntryOpen={noop}
      />
    );

    await waitFor(() => {
      expect(screen.getByText(/Failed to load related records/i)).toBeInTheDocument();
    });
  });

  it('re-fetches when __refreshKey bumps (e.g. after an action-bar tool run)', async () => {
    mockListRelated.mockResolvedValue({
      entries: [{ id: 'ps-1', custom_fields: {} }] as unknown as Entry[],
      nextCursor: null,
      hasMore: false,
    });

    const { rerender } = render(
      <ReverseRelationListWidget
        view={view({ relation: 'pay_run', __bindings: { entryId: 'pay-run-1', __refreshKey: 0 } })}
        entries={[]}
        isLoading={false}
        onEntryOpen={noop}
      />
    );
    await waitFor(() => expect(mockListRelated).toHaveBeenCalledTimes(1));

    // Same entryId/relation, only __refreshKey changed — must still refetch.
    rerender(
      <ReverseRelationListWidget
        view={view({ relation: 'pay_run', __bindings: { entryId: 'pay-run-1', __refreshKey: 1 } })}
        entries={[]}
        isLoading={false}
        onEntryOpen={noop}
      />
    );
    await waitFor(() => expect(mockListRelated).toHaveBeenCalledTimes(2));
  });
});
