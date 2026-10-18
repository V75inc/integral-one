import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

const mockTracksList = vi.fn();
const mockEntriesList = vi.fn();

vi.mock('../../../api', async importOriginal => {
  const actual = await importOriginal<typeof import('../../../api')>();
  return {
    ...actual,
    tracksApi: { ...actual.tracksApi, list: () => mockTracksList() },
    entriesApi: { ...actual.entriesApi, list: (p?: unknown) => mockEntriesList(p) },
  };
});

import { TreeRegionWidget } from '../TreeRegionWidget';
import type { Entry, SavedView } from '../../../types';

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function baseView(config: Record<string, unknown>): SavedView {
  return {
    id: 'view-1',
    name: 'Org Chart',
    type: 'tree_region',
    track_id: 'track-employees',
    config,
  };
}

// A small self-relational chain, including one node whose parent points at
// a missing id — proving buildPageTree's existing root-fallback behavior
// integrates correctly through this widget (not re-testing buildPageTree
// itself, which already has its own dedicated test file).
const entries = [
  { id: 'ceo', title: 'Ada (CEO)', custom_fields: { manager: null } },
  { id: 'vp', title: 'Ben (VP)', custom_fields: { manager: 'ceo' } },
  { id: 'ic', title: 'Cy (IC)', custom_fields: { manager: 'vp' } },
  { id: 'orphan', title: 'Dee (Orphan)', custom_fields: { manager: 'does-not-exist' } },
] as unknown as Entry[];

describe('TreeRegionWidget', () => {
  it('renders a nested org chart from the entries prop using parent_field', () => {
    render(
      <TreeRegionWidget
        view={baseView({ parent_field: 'custom_fields.manager' })}
        entries={entries}
        isLoading={false}
        onEntryOpen={() => {}}
      />
    );

    expect(screen.getByText('Ada (CEO)')).toBeInTheDocument();
    expect(screen.getByText('Ben (VP)')).toBeInTheDocument();
    expect(screen.getByText('Cy (IC)')).toBeInTheDocument();
    // Orphan's manager id doesn't resolve to any known entry — buildPageTree
    // falls back to placing it at root rather than dropping it.
    expect(screen.getByText('Dee (Orphan)')).toBeInTheDocument();
  });

  it('collapses and expands a branch on click', () => {
    render(
      <TreeRegionWidget
        view={baseView({ parent_field: 'custom_fields.manager' })}
        entries={entries}
        isLoading={false}
        onEntryOpen={() => {}}
      />
    );

    expect(screen.getByText('Ben (VP)')).toBeInTheDocument();
    // First "Collapse" button belongs to the root (Ada/CEO) row — collapsing
    // it hides both of its descendants (Ben, Cy).
    fireEvent.click(screen.getAllByLabelText('Collapse')[0]);
    expect(screen.queryByText('Ben (VP)')).not.toBeInTheDocument();
    fireEvent.click(screen.getByLabelText('Expand'));
    expect(screen.getByText('Ben (VP)')).toBeInTheDocument();
  });

  it('invokes onEntryOpen when a row is clicked', () => {
    const onEntryOpen = vi.fn();
    render(
      <TreeRegionWidget
        view={baseView({ parent_field: 'custom_fields.manager' })}
        entries={entries}
        isLoading={false}
        onEntryOpen={onEntryOpen}
      />
    );
    fireEvent.click(screen.getByText('Ada (CEO)'));
    expect(onEntryOpen).toHaveBeenCalledWith(entries[0]);
  });

  it('source_track mode resolves the track and fetches its own entries', async () => {
    mockTracksList.mockResolvedValue([
      { id: 'resolved-track-id', title: 'Employees', template_id: 'employees' },
    ]);
    mockEntriesList.mockResolvedValue([
      { id: 'root', title: 'Root Person', custom_fields: { manager: null } },
    ]);

    render(
      <TreeRegionWidget
        view={baseView({
          source_track: 'employees',
          parent_field: 'custom_fields.manager',
        })}
        entries={[]}
        isLoading={false}
        onEntryOpen={() => {}}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('Root Person')).toBeInTheDocument();
    });
    expect(mockEntriesList).toHaveBeenCalledWith({ track_id: 'resolved-track-id', limit: 200 });
  });
});
