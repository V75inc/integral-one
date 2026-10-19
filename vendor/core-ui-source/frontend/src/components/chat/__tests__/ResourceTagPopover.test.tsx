import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';

import {
  ResourceTagPopover,
  type ResourceTagCandidate,
} from '../ResourceTagPopover';

const mockApps = [
  { id: 'app-inv', name: 'Inventory Management', workspace_id: 'ws-1' },
  { id: 'app-crm', name: 'Personal CRM', workspace_id: 'ws-1' },
];

const mockTracks = [
  { id: 'trk-1', title: 'Products', app: { id: 'app-inv', name: 'Inventory Management' } },
  { id: 'trk-2', title: 'Stock Movements', app: { id: 'app-inv', name: 'Inventory Management' } },
  { id: 'trk-3', title: 'Contacts', app: { id: 'app-crm', name: 'Personal CRM' } },
  { id: 'trk-4', title: 'Activities', app: { id: 'app-crm', name: 'Personal CRM' } },
  { id: 'trk-5', title: 'Standalone Track' },
  ...Array.from({ length: 10 }, (_, i) => ({
    id: `trk-extra-${i}`,
    title: `Extra Track ${i}`,
    app: { id: 'app-inv', name: 'Inventory Management' },
  })),
];

vi.mock('../../../api/apps', () => ({
  appsApi: {
    list: vi.fn(() => Promise.resolve(mockApps)),
  },
}));

vi.mock('../../../api/tracks', () => ({
  tracksApi: {
    list: vi.fn(() => Promise.resolve(mockTracks)),
  },
}));

vi.mock('../../../context/ScopeContext', () => ({
  useScope: () => ({ scope: { workspaceId: 'ws-1' } }),
}));

describe('ResourceTagPopover', () => {
  let onCandidatesChange: (items: ResourceTagCandidate[]) => void;
  let onSelect: (item: ResourceTagCandidate) => void;
  let onDismiss: () => void;

  beforeEach(() => {
    onCandidatesChange = vi.fn();
    onSelect = vi.fn();
    onDismiss = vi.fn();
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('renders all available Apps and Tracks without 12-item truncation', async () => {
    render(
      <ResourceTagPopover
        query=""
        position={{ top: 100, left: 100 }}
        highlightIndex={0}
        onCandidatesChange={onCandidatesChange}
        onSelect={onSelect}
        onDismiss={onDismiss}
      />,
    );

    // Wait for options to load
    await waitFor(() => {
      // 2 apps + 15 tracks = 17 items total
      expect(screen.getByText('Inventory Management')).toBeDefined();
      expect(screen.getByText('Products')).toBeDefined();
    });

    expect(screen.getByText('17 options available')).toBeDefined();
  });

  it('filters by tabs (Apps, Tracks, All)', async () => {
    render(
      <ResourceTagPopover
        query=""
        position={{ top: 100, left: 100 }}
        highlightIndex={0}
        onCandidatesChange={onCandidatesChange}
        onSelect={onSelect}
        onDismiss={onDismiss}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText('Inventory Management')).toBeDefined();
    });

    // Switch to Apps tab
    const appsTab = screen.getByRole('button', { name: /Apps/i });
    fireEvent.click(appsTab);

    expect(screen.getByText('Inventory Management')).toBeDefined();
    expect(screen.getByText('Personal CRM')).toBeDefined();
    expect(screen.queryByText('Products')).toBeNull();

    // Switch to Tracks tab
    const tracksTab = screen.getByRole('button', { name: /^Tracks/i });
    fireEvent.click(tracksTab);

    expect(screen.queryByText('Inventory Management')).toBeNull();
    expect(screen.getByText('Products')).toBeDefined();
    expect(screen.getByText('Contacts')).toBeDefined();
  });

  it('allows filtering by a specific App', async () => {
    render(
      <ResourceTagPopover
        query=""
        position={{ top: 100, left: 100 }}
        highlightIndex={0}
        onCandidatesChange={onCandidatesChange}
        onSelect={onSelect}
        onDismiss={onDismiss}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText('Inventory Management')).toBeDefined();
    });

    // Click filter button on Inventory Management
    const filterBtn = screen.getByRole('button', {
      name: /Filter tracks in Inventory Management/i,
    });
    fireEvent.click(filterBtn);

    // Active filter banner should show
    expect(screen.getByText(/Filtering content in:/i)).toBeDefined();

    // Should only show content associated with Inventory Management
    expect(screen.getAllByText('Inventory Management').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('Products')).toBeDefined();
    expect(screen.getByText('Stock Movements')).toBeDefined();
    // Contacts from Personal CRM should NOT be visible
    expect(screen.queryByText('Contacts')).toBeNull();

    // Verify tracks for this app are prioritized at the top
    const filterCalls = (onCandidatesChange as any).mock.calls;
    const currentCandidates: ResourceTagCandidate[] = filterCalls[filterCalls.length - 1][0];
    expect(currentCandidates[0].kind).toBe('track');
    expect(currentCandidates[0].isPrioritized).toBe(true);
    expect(currentCandidates[0].subtitle).toContain('Inventory Management');

    // Clear filter
    const clearBtn = screen.getByRole('button', { name: /Clear/i });
    fireEvent.click(clearBtn);

    expect(screen.getByText('Contacts')).toBeDefined();
  });

  it('matches tracks when user queries an App name', async () => {
    render(
      <ResourceTagPopover
        query="Inventory"
        position={{ top: 100, left: 100 }}
        highlightIndex={0}
        onCandidatesChange={onCandidatesChange}
        onSelect={onSelect}
        onDismiss={onDismiss}
      />,
    );

    await waitFor(() => {
      // Both the app and its tracks (Products, Stock Movements) should appear!
      expect(screen.getByText('Inventory Management')).toBeDefined();
      expect(screen.getByText('Products')).toBeDefined();
      expect(screen.getByText('Stock Movements')).toBeDefined();
    });

    // Personal CRM should not appear
    expect(screen.queryByText('Personal CRM')).toBeNull();
  });

  it('prioritizes tracks belonging to previously tagged apps at the top of the list', async () => {
    render(
      <ResourceTagPopover
        query=""
        position={{ top: 100, left: 100 }}
        highlightIndex={0}
        previouslyTaggedAppIds={['app-inv']}
        onCandidatesChange={onCandidatesChange}
        onSelect={onSelect}
        onDismiss={onDismiss}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText('Products')).toBeDefined();
    });

    // Verify onCandidatesChange was called with prioritized tracks first
    const calls = (onCandidatesChange as any).mock.calls;
    const lastCandidates: ResourceTagCandidate[] = calls[calls.length - 1][0];

    // First candidate should be a prioritized track in Inventory Management
    expect(lastCandidates[0].kind).toBe('track');
    expect(lastCandidates[0].isPrioritized).toBe(true);
    expect(lastCandidates[0].subtitle).toContain('Inventory Management');
  });

  it('calls onSelect when an item is clicked', async () => {
    render(
      <ResourceTagPopover
        query=""
        position={{ top: 100, left: 100 }}
        highlightIndex={0}
        onCandidatesChange={onCandidatesChange}
        onSelect={onSelect}
        onDismiss={onDismiss}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText('Products')).toBeDefined();
    });

    const trackRow = screen.getByText('Products');
    fireEvent.click(trackRow);

    expect(onSelect).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'track',
        id: 'trk-1',
        label: 'Products',
      }),
    );
  });
});
