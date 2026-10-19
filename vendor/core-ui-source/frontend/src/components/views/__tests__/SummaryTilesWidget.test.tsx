import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

const mockGet = vi.fn();

vi.mock('../../../api', async importOriginal => {
  const actual = await importOriginal<typeof import('../../../api')>();
  return {
    ...actual,
    entriesApi: {
      ...actual.entriesApi,
      get: (id: string) => mockGet(id),
    },
  };
});

import { SummaryTilesWidget } from '../SummaryTilesWidget';
import type { SavedView } from '../../../types';

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function baseView(config: Record<string, unknown>): SavedView {
  return {
    id: 'view-1',
    name: 'PAYE Summary',
    type: 'summary_tiles',
    track_id: 'track-1',
    config,
  };
}

describe('SummaryTilesWidget', () => {
  it('fetches the host entry and renders each configured tile', async () => {
    mockGet.mockResolvedValue({
      id: 'entry-1',
      title: 'PAYE Filing',
      custom_fields: {
        total_entries: 3,
        total_income: 450000.5,
        total_deductions: 12000,
        total_tax: 30000,
      },
    });

    render(
      <SummaryTilesWidget
        view={baseView({
          title: 'Summary',
          tiles: [
            { label: 'Entries', field: 'total_entries', format: 'count' },
            { label: 'Total Income', field: 'total_income', format: 'currency' },
            { label: 'Total Deductions', field: 'total_deductions', format: 'currency' },
            { label: 'Total Tax Deducted', field: 'total_tax', format: 'currency' },
          ],
          __bindings: { entryId: 'entry-1' },
        })}
        entries={[]}
        isLoading={false}
        onEntryOpen={() => {}}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('Summary')).toBeInTheDocument();
    });
    expect(mockGet).toHaveBeenCalledWith('entry-1');
    expect(screen.getByText('Entries')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.getByText('Total Income')).toBeInTheDocument();
    expect(screen.getByText('450,000.50')).toBeInTheDocument();
    expect(screen.getByText('Total Tax Deducted')).toBeInTheDocument();
    expect(screen.getByText('30,000.00')).toBeInTheDocument();
  });

  it('renders an em dash for a missing/null field value', async () => {
    mockGet.mockResolvedValue({
      id: 'entry-1',
      title: 'PAYE Filing',
      custom_fields: { total_entries: 0 },
    });

    render(
      <SummaryTilesWidget
        view={baseView({
          tiles: [
            { label: 'Entries', field: 'total_entries', format: 'count' },
            { label: 'Total Income', field: 'total_income', format: 'currency' },
          ],
          __bindings: { entryId: 'entry-1' },
        })}
        entries={[]}
        isLoading={false}
        onEntryOpen={() => {}}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('Entries')).toBeInTheDocument();
    });
    expect(screen.getByText('0')).toBeInTheDocument();
    expect(screen.getByText('—')).toBeInTheDocument();
  });

  it('renders nothing while there is no host entry id', () => {
    const { container } = render(
      <SummaryTilesWidget
        view={baseView({ tiles: [{ label: 'Entries', field: 'total_entries' }] })}
        entries={[]}
        isLoading={false}
        onEntryOpen={() => {}}
      />
    );
    expect(container).toBeEmptyDOMElement();
    expect(mockGet).not.toHaveBeenCalled();
  });

  it('re-fetches when __refreshKey bumps (e.g. after an action-bar tool run)', async () => {
    mockGet.mockResolvedValue({
      id: 'pay-run-1',
      title: 'Pay Run',
      custom_fields: { gross_total: 0, headcount: 0 },
    });

    const { rerender } = render(
      <SummaryTilesWidget
        view={baseView({
          tiles: [{ label: 'Total Payout', field: 'gross_total', format: 'currency' }],
          __bindings: { entryId: 'pay-run-1', __refreshKey: 0 },
        })}
        entries={[]}
        isLoading={false}
        onEntryOpen={() => {}}
      />
    );
    await waitFor(() => expect(mockGet).toHaveBeenCalledTimes(1));

    rerender(
      <SummaryTilesWidget
        view={baseView({
          tiles: [{ label: 'Total Payout', field: 'gross_total', format: 'currency' }],
          __bindings: { entryId: 'pay-run-1', __refreshKey: 1 },
        })}
        entries={[]}
        isLoading={false}
        onEntryOpen={() => {}}
      />
    );
    await waitFor(() => expect(mockGet).toHaveBeenCalledTimes(2));
  });
});
