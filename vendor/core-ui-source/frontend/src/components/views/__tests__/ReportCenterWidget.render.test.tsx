import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import type { Entry, EntryTypeNode, SavedView } from '../../../types';

const mockTracksList = vi.fn();
const mockEntriesList = vi.fn();
const mockEntryTypesList = vi.fn();

vi.mock('../../../api', async importOriginal => {
  const actual = await importOriginal<typeof import('../../../api')>();
  return {
    ...actual,
    tracksApi: { ...actual.tracksApi, list: (...args: unknown[]) => mockTracksList(...args) },
    entriesApi: { ...actual.entriesApi, list: (...args: unknown[]) => mockEntriesList(...args) },
    entryTypesApi: { ...actual.entryTypesApi, list: (...args: unknown[]) => mockEntryTypesList(...args) },
  };
});

import { ReportCenterWidget } from '../ReportCenterWidget';

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function view(config: Record<string, unknown>): SavedView {
  return {
    id: 'view-1',
    name: 'Payroll Reports & Trends',
    type: 'operations-ui/report-center',
    track_id: 'payroll_reports',
    config,
  } as SavedView;
}

const noop = () => {};

describe('ReportCenterWidget with source_track', () => {
  it("humanizes a select column's value even though the CURRENT track (a dashboard-only track with no entry types of its own) carries no field metadata — must resolve the sourced track's own fields", async () => {
    // Real-world shape: payroll-app's "Payroll Reports & Trends" track
    // declares zero entry_types (it's a dashboard-only track) and reports
    // via `source_track: pay_runs`. Its own `fields` prop (from the
    // CURRENT track) is empty, but the sourced pay_run entries have a
    // `status` select field — the table column must still humanize
    // "approved" the same way TableWidget's Pay Runs tab already does,
    // not print the raw stored value.
    mockTracksList.mockResolvedValue([
      { id: 'trk_pay_runs', title: 'Guyana Pay Runs', template_id: 'pay_runs' },
    ]);
    mockEntriesList.mockResolvedValue([
      {
        id: 'e1',
        title: 'September 2026',
        status: 'active',
        custom_fields: { status: 'approved', pay_date: '2026-10-05' },
      },
    ] as unknown as Entry[]);
    mockEntryTypesList.mockResolvedValue([
      {
        id: 'et1',
        name: 'Pay run',
        form_schema: {
          fields: [{ key: 'status', name: 'Status', type: 'select', enum: ['draft', 'approved', 'paid'] }],
        },
      },
    ] as unknown as EntryTypeNode[]);

    render(
      <ReportCenterWidget
        view={view({
          title: 'Payroll Reports & Trends',
          source_track: 'pay_runs',
          reports: [
            {
              key: 'pay_run_register',
              kind: 'table',
              title: 'Pay-run register',
              columns: [
                { label: 'Pay run', field: 'title' },
                { label: 'Status', field: 'custom_fields.status' },
                { label: 'Lifecycle', field: 'status' },
              ],
            },
          ],
        })}
        entries={[]}
        fields={[]}
        isLoading={false}
        onEntryOpen={noop}
      />
    );

    await waitFor(() => {
      expect(mockEntryTypesList).toHaveBeenCalledWith({ track_id: 'trk_pay_runs' });
    });
    await waitFor(() => {
      expect(screen.getAllByText('Approved').length).toBeGreaterThan(0);
    });
    expect(screen.queryByText('approved')).not.toBeInTheDocument();
    expect(screen.getAllByText('active').length).toBeGreaterThan(0);
  });
});
