import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import {
  entryTypeSlug,
  filterEntryTypeSlugsForView,
  resolveCreateDefaultEntryType,
} from '../entryFormCustomFields';
import {
  useEntryExpandedForm,
} from '../EntryFormExpanded';
import { entryTypesForTrackQueryKey, tagsForTrackQueryKey } from '../../../queryKeys';
import type { EntryTypeNode, Track } from '../../../types';

vi.mock('../../../api', () => ({
  attachmentsApi: {},
  entriesApi: { list: vi.fn().mockResolvedValue([]) },
  entryTypesApi: { list: vi.fn() },
  linkPreviewApi: {},
  tagsApi: { list: vi.fn().mockResolvedValue([]) },
  tracksApi: { list: vi.fn().mockResolvedValue([]), get: vi.fn() },
}));

const trackId = 'trk_1';
const entryTypes: EntryTypeNode[] = [
  { id: 'et_note', name: 'note', track_id: trackId, form_schema: { fields: [] } },
  { id: 'et_task', name: 'task', track_id: trackId, form_schema: { fields: [] } },
  { id: 'et_deal', name: 'deal', track_id: trackId, form_schema: { fields: [] } },
];

const stubTrack = {
  id: trackId,
  title: 'Pipeline',
  operational_model_defaults: { default_entry_type: 'note' },
} as Track;

function wrapper(client: QueryClient) {
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
}

function seedQueries(client: QueryClient) {
  client.setQueryData(entryTypesForTrackQueryKey(trackId), entryTypes);
  client.setQueryData(tagsForTrackQueryKey(trackId), []);
}

describe('resolveCreateDefaultEntryType', () => {
  const slugs = ['note', 'task', 'deal'];

  it('prefers view default when allowed', () => {
    expect(
      resolveCreateDefaultEntryType(slugs, ['task', 'deal'], 'task', 'note')
    ).toBe('task');
  });

  it('falls back to first view-allowed slug', () => {
    expect(
      resolveCreateDefaultEntryType(slugs, ['deal'], '', 'note')
    ).toBe('deal');
  });

  it('falls back to track default when view has no constraint match', () => {
    expect(
      resolveCreateDefaultEntryType(slugs, undefined, undefined, 'deal')
    ).toBe('deal');
  });
});

describe('filterEntryTypeSlugsForView', () => {
  it('narrows slugs to view entry_type_keys', () => {
    expect(filterEntryTypeSlugsForView(entryTypes, ['task', 'deal'])).toEqual([
      'task',
      'deal',
    ]);
  });

  it('uses the manifest key, not the display name, when the two diverge', () => {
    // payroll-app's real shape: key `paye_7b_batch`, name "Form 7B (Annual
    // Emolument Slips)" — slugifying the name gives
    // "form_7b_annual_emolument_slips", which never matches the view's
    // `entry_type_keys: ['paye_7b_batch']`. Real-world symptom: the "New X"
    // composer button on the "7B Batches" tab stayed "New Nis schedule"
    // (the whole track's OTHER entry type, whose name happens to slug the
    // same as its key) because the name-slug filter matched nothing and
    // silently fell through to the unfiltered full track entry-type list.
    const divergentEntryTypes: EntryTypeNode[] = [
      {
        id: 'et_nis',
        name: 'NIS Schedule',
        track_id: trackId,
        form_schema: { fields: [], _manifest_entry_type_key: 'nis_schedule' },
      },
      {
        id: 'et_7b',
        name: 'Form 7B (Annual Emolument Slips)',
        track_id: trackId,
        form_schema: { fields: [], _manifest_entry_type_key: 'paye_7b_batch' },
      },
    ];
    expect(
      filterEntryTypeSlugsForView(divergentEntryTypes, ['paye_7b_batch'])
    ).toEqual(['paye_7b_batch']);
  });
});

describe('entryTypeSlug', () => {
  it('prefers the manifest key over the display name', () => {
    expect(
      entryTypeSlug({
        id: 'et_7b',
        name: 'Form 7B (Annual Emolument Slips)',
        form_schema: { _manifest_entry_type_key: 'paye_7b_batch' },
      })
    ).toBe('paye_7b_batch');
  });

  it('falls back to the name for entry types with no manifest key on record', () => {
    expect(entryTypeSlug({ id: 'et_note', name: 'Note' })).toBe('note');
  });
});

describe('useEntryExpandedForm create default type', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('updates type when view default changes on the same track', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    seedQueries(client);
    const showToast = vi.fn();

    const { result, rerender } = renderHook(
      (props: {
        viewEntryTypeKeys?: string[];
        viewDefaultEntryTypeKey?: string;
      }) =>
        useEntryExpandedForm({
          mode: 'create',
          enabled: true,
          track: stubTrack,
          tracksList: [],
          needsTrackPicker: false,
          viewEntryTypeKeys: props.viewEntryTypeKeys,
          viewDefaultEntryTypeKey: props.viewDefaultEntryTypeKey,
          showToast,
        }),
      {
        wrapper: wrapper(client),
        initialProps: {
          viewEntryTypeKeys: ['task'],
          viewDefaultEntryTypeKey: 'task',
        },
      }
    );

    await waitFor(() => {
      expect(result.current.type).toBe('task');
    });

    rerender({
      viewEntryTypeKeys: ['deal'],
      viewDefaultEntryTypeKey: 'deal',
    });

    await waitFor(() => {
      expect(result.current.type).toBe('deal');
    });
  });

  it('keeps user-selected type when still allowed after view switch', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    seedQueries(client);
    const showToast = vi.fn();

    const { result, rerender } = renderHook(
      (props: {
        viewEntryTypeKeys?: string[];
        viewDefaultEntryTypeKey?: string;
      }) =>
        useEntryExpandedForm({
          mode: 'create',
          enabled: true,
          track: stubTrack,
          tracksList: [],
          needsTrackPicker: false,
          viewEntryTypeKeys: props.viewEntryTypeKeys,
          viewDefaultEntryTypeKey: props.viewDefaultEntryTypeKey,
          showToast,
        }),
      {
        wrapper: wrapper(client),
        initialProps: {
          viewEntryTypeKeys: ['task', 'deal'],
          viewDefaultEntryTypeKey: 'task',
        },
      }
    );

    await waitFor(() => {
      expect(result.current.type).toBe('task');
    });

    act(() => {
      result.current.setType('deal');
    });

    rerender({
      viewEntryTypeKeys: ['task', 'deal'],
      viewDefaultEntryTypeKey: 'task',
    });

    await waitFor(() => {
      expect(result.current.type).toBe('deal');
    });
  });

  it('resolves the correct type on a view whose entry type name diverges from its manifest key', async () => {
    // End-to-end repro of the "New X" composer button staying stuck on the
    // wrong entry type after switching track tabs (payroll-app's Filings
    // track: NIS Filings -> 7B Batches). `type` state is the same value
    // `composerActionLabel` derives the button text from, so a wrong `type`
    // here is exactly that bug, not just a cosmetic label mismatch.
    const divergentTrackId = 'trk_filings';
    const divergentEntryTypes: EntryTypeNode[] = [
      {
        id: 'et_nis',
        name: 'NIS Schedule',
        track_id: divergentTrackId,
        form_schema: { fields: [], _manifest_entry_type_key: 'nis_schedule' },
      },
      {
        id: 'et_7b',
        name: 'Form 7B (Annual Emolument Slips)',
        track_id: divergentTrackId,
        form_schema: { fields: [], _manifest_entry_type_key: 'paye_7b_batch' },
      },
    ];
    const divergentTrack = {
      id: divergentTrackId,
      title: 'Filings',
      operational_model_defaults: { default_entry_type: 'nis_schedule' },
    } as Track;

    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    client.setQueryData(
      entryTypesForTrackQueryKey(divergentTrackId),
      divergentEntryTypes
    );
    client.setQueryData(tagsForTrackQueryKey(divergentTrackId), []);
    const showToast = vi.fn();

    const { result, rerender } = renderHook(
      (props: {
        viewEntryTypeKeys?: string[];
        viewDefaultEntryTypeKey?: string;
      }) =>
        useEntryExpandedForm({
          mode: 'create',
          enabled: true,
          track: divergentTrack,
          tracksList: [],
          needsTrackPicker: false,
          viewEntryTypeKeys: props.viewEntryTypeKeys,
          viewDefaultEntryTypeKey: props.viewDefaultEntryTypeKey,
          showToast,
        }),
      {
        wrapper: wrapper(client),
        initialProps: {
          viewEntryTypeKeys: ['nis_schedule'],
          viewDefaultEntryTypeKey: 'nis_schedule',
        },
      }
    );

    await waitFor(() => {
      expect(result.current.type).toBe('nis_schedule');
    });

    // Switch to the "7B Batches" tab.
    rerender({
      viewEntryTypeKeys: ['paye_7b_batch'],
      viewDefaultEntryTypeKey: 'paye_7b_batch',
    });

    await waitFor(() => {
      expect(result.current.type).toBe('paye_7b_batch');
    });
  });
});
