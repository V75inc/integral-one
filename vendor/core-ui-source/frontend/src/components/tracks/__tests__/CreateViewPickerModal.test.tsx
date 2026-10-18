import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ComponentProps } from 'react';

const mockCreate = vi.fn();
const mockAddViewToTrackProfile = vi.fn();
const mockSubstrate = vi.fn();
const mockShowToast = vi.fn();

vi.mock('../../../api', () => ({
  trackViewsApi: {
    create: (...args: unknown[]) => mockCreate(...args),
  },
}));

vi.mock('../../../api/operationalModels', () => ({
  operationalModelsApi: {
    addViewToTrackProfile: (...args: unknown[]) =>
      mockAddViewToTrackProfile(...args),
  },
}));

vi.mock('../../../api/operationalModelDrafts', () => ({
  operationalModelDraftsApi: {
    substrate: () => mockSubstrate(),
  },
}));

vi.mock('../../../context/ToastContext', () => ({
  useToast: () => ({ showToast: mockShowToast }),
}));

vi.mock('../../../views/registry', () => ({
  listWidgets: () => [
    {
      type: 'table',
      meta: { label: 'Table', description: 'Sortable grid' },
      component: () => null,
    },
    {
      type: 'calendar',
      meta: { label: 'Calendar', description: 'Month grid' },
      component: () => null,
    },
    {
      type: 'kanban',
      meta: { label: 'Kanban', description: 'Board' },
      component: () => null,
    },
  ],
}));

import {
  buildCreateViewConfig,
  CreateViewPickerModal,
} from '../CreateViewPickerModal';
import { mergeViewTypeCatalog, isTrackCreatableViewType } from '../../../hooks/useViewTypeCatalog';

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function renderModal(props: Partial<ComponentProps<typeof CreateViewPickerModal>> = {}) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <CreateViewPickerModal
        open
        onClose={vi.fn()}
        trackId="track-1"
        entryTypes={[
          {
            id: 'et-1',
            name: 'Task',
            form_schema: {
              fields: [{ key: 'due_date', name: 'Due', type: 'date' }],
            },
          } as never,
        ]}
        {...props}
      />
    </QueryClientProvider>
  );
}

describe('useViewTypeCatalog helpers', () => {
  it('intersects substrate with widgets; drops hosts and frontend-only types', () => {
    const merged = mergeViewTypeCatalog(
      [
        { type: 'table', label: 'Table', description: 'From substrate' },
        { type: 'layout_container', label: 'Layout' },
        { type: 'kanban', label: 'Kanban', description: 'Board' },
      ],
      [
        {
          type: 'table',
          meta: { label: 'Table', description: 'Widget' },
          scope: 'track',
        },
        {
          type: 'calendar',
          meta: { label: 'Calendar', description: 'Widget cal' },
          scope: 'track',
        },
        {
          type: 'editable_table',
          meta: { label: 'Editable table', description: 'Local only' },
          scope: 'both',
        },
        {
          type: 'kanban',
          meta: { label: 'Kanban', description: 'Board' },
          scope: 'track',
        },
        {
          type: 'form_region',
          meta: { label: 'Form', description: 'Entry host' },
          scope: 'entry',
        },
      ]
    );
    // calendar / editable_table are widget-only → excluded
    // layout_container / form_region excluded as non-track hosts
    expect(merged.map(e => e.type)).toEqual(['kanban', 'table']);
    expect(merged.find(e => e.type === 'table')?.description).toBe(
      'From substrate'
    );
  });

  it('rejects region-system host types for track tabs', () => {
    expect(
      isTrackCreatableViewType('table', {
        type: 'table',
        meta: { label: 'T' },
        scope: 'track',
      })
    ).toBe(true);
    expect(
      isTrackCreatableViewType('region-system/editable-related-lines')
    ).toBe(false);
    expect(isTrackCreatableViewType('layout_container')).toBe(false);
    expect(
      isTrackCreatableViewType('form_region', {
        type: 'form_region',
        meta: { label: 'Form' },
        scope: 'entry',
      })
    ).toBe(false);
  });
});

describe('buildCreateViewConfig', () => {
  it('includes calendar date_field', () => {
    expect(
      buildCreateViewConfig('calendar', {
        dateField: 'due_date',
        wikiParentField: '',
      })
    ).toEqual({
      calendar_mapping: { date_field: 'due_date' },
    });
  });
});

describe('CreateViewPickerModal', () => {
  beforeEach(() => {
    mockSubstrate.mockResolvedValue({
      view_types: [
        { type: 'table', label: 'Table', description: 'Sortable grid' },
        { type: 'calendar', label: 'Calendar', description: 'Month grid' },
        { type: 'kanban', label: 'Kanban', description: 'Board' },
      ],
      field_types: [],
      plugins: [],
      registry_versions: { field_types: 1, view_types: 1 },
    });
    mockAddViewToTrackProfile.mockResolvedValue({
      view: { id: 'v1', name: 'Calendar', type: 'calendar' },
    });
    mockCreate.mockResolvedValue({
      id: 'v1',
      name: 'Calendar',
      type: 'calendar',
    });
  });

  it('renders tiles and keeps Next disabled until a type is selected', async () => {
    renderModal();
    await screen.findByRole('option', { name: /Calendar/i });
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();
    fireEvent.click(screen.getByRole('option', { name: /Calendar/i }));
    expect(screen.getByRole('button', { name: 'Next' })).not.toBeDisabled();
  });

  it('creates a calendar view with date_field via OM profile path', async () => {
    const onCreated = vi.fn();
    renderModal({ onCreated });

    fireEvent.click(await screen.findByRole('option', { name: /Calendar/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));

    const nameInput = await screen.findByPlaceholderText(/Calendar/);
    fireEvent.change(nameInput, { target: { value: 'Schedule' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));

    await waitFor(() => {
      expect(mockAddViewToTrackProfile).toHaveBeenCalledWith(
        'track-1',
        expect.objectContaining({
          name: 'Schedule',
          view_type: 'calendar',
          type: 'calendar',
          config: {
            calendar_mapping: { date_field: 'created_at' },
          },
        })
      );
    });
    expect(mockCreate).not.toHaveBeenCalled();
    expect(onCreated).toHaveBeenCalled();
  });

  it('falls back to trackViewsApi when OM profile is missing (404)', async () => {
    mockAddViewToTrackProfile.mockRejectedValue({
      response: { status: 404 },
    });
    const onCreated = vi.fn();
    renderModal({ onCreated });

    fireEvent.click(await screen.findByRole('option', { name: /Table/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));

    const nameInput = await screen.findByPlaceholderText(/Table/);
    fireEvent.change(nameInput, { target: { value: 'Grid' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));

    await waitFor(() => {
      expect(mockCreate).toHaveBeenCalledWith(
        'track-1',
        expect.objectContaining({
          name: 'Grid',
          type: 'table',
        })
      );
    });
    expect(onCreated).toHaveBeenCalled();
  });
});
