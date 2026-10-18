import type { ReactElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import '@testing-library/jest-dom/vitest';

const mockEntriesList = vi.fn();

vi.mock('../../../api', async importOriginal => {
  const actual = await importOriginal<typeof import('../../../api')>();
  return {
    ...actual,
    entriesApi: { ...actual.entriesApi, list: (...args: unknown[]) => mockEntriesList(...args) },
  };
});

import { SettingsHubWidget } from '../SettingsHubWidget';
import type { Entry, EntryTypeNode, SavedView } from '../../../types';

function makeClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
}

function renderHub(ui: ReactElement) {
  const client = makeClient();
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

const noop = () => {};

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function view(sections: Record<string, unknown>[]): SavedView {
  return {
    id: 'view-1',
    name: 'App Settings',
    type: 'operations-ui/settings_hub',
    track_id: 'trk_settings',
    config: {
      title: 'App settings',
      description: 'Configure how this App runs.',
      sections,
    },
  } as SavedView;
}

describe('SettingsHubWidget section header', () => {
  it('lets the add-record button row wrap onto its own line instead of squeezing the section title/description', async () => {
    // Regression for the "Statutory Rates" tab: three+ Add buttons
    // ("Add PAYE band", "Add NIS contribution cap", "Add Fiscal
    // allowances") in one section pushed the title/description column so
    // narrow every word wrapped onto its own line, because the button
    // group had `shrink-0` inside a non-wrapping flex row — all the
    // squeeze landed on the title instead of the buttons dropping to a
    // second line. The header row must be able to wrap, and the button
    // group must not be pinned to shrink-0, so a tight container (e.g.
    // with the chat dock open) wraps buttons below the title instead.
    mockEntriesList.mockResolvedValue([]);
    renderHub(
      <SettingsHubWidget
        view={view([
          {
            key: 'statutory_rates',
            title: 'Statutory Rates',
            description: 'Maintain PAYE, NIS, and fiscal allowance rules by effective date.',
            entry_type_keys: ['paye_band', 'nis_contribution_cap', 'fiscal_allowances'],
          },
        ])}
        entries={[]}
        isLoading={false}
        onEntryOpen={noop}
        onEntryCreate={async () => undefined}
        entryTypes={[]}
      />,
    );

    const heading = await screen.findByRole('heading', { name: 'Statutory Rates' });
    const headerRow = heading.closest('div')?.parentElement;
    expect(headerRow).not.toBeNull();
    expect(headerRow?.className).toContain('flex-wrap');

    const addButton = screen.getByRole('button', { name: /Add Paye Band/i });
    const buttonGroup = addButton.parentElement;
    expect(buttonGroup?.className).not.toContain('shrink-0');
    expect(buttonGroup?.className).toContain('flex-wrap');
  });
});

describe('SettingsHubWidget value-field badges', () => {
  it("humanizes a select-typed value field's badge instead of showing the raw stored string", async () => {
    // Regression for the "Pay Calendar" tab: the section's own SettingField
    // config only distinguishes 'toggle' vs plain 'value', so it doesn't
    // know "cadence" is a select field — the badge rendered raw "monthly"
    // while the create form's own select control (and every other read
    // surface — TableWidget, ReportCenterWidget) shows "Monthly" for the
    // identical stored value.
    mockEntriesList.mockResolvedValue([]);
    const entry = {
      id: 'e1',
      title: 'Monthly Calendar',
      type: 'pay_calendar',
      custom_fields: { cadence: 'monthly' },
    } as unknown as Entry;
    const entryTypes = [
      {
        id: 'et1',
        name: 'Pay calendar',
        form_schema: {
          fields: [{ key: 'cadence', name: 'Cadence', type: 'select', enum: ['monthly', 'biweekly', 'weekly'] }],
        },
      },
    ] as unknown as EntryTypeNode[];

    renderHub(
      <SettingsHubWidget
        view={view([
          {
            key: 'pay_calendar',
            title: 'Pay Calendar',
            entry_type_keys: ['pay_calendar'],
            fields: [{ key: 'cadence', label: 'Cadence', type: 'value' }],
          },
        ])}
        entries={[entry]}
        isLoading={false}
        onEntryOpen={noop}
        onEntryCreate={async () => undefined}
        entryTypes={entryTypes}
      />,
    );

    expect(await screen.findByText('Monthly')).toBeInTheDocument();
    expect(screen.queryByText('monthly')).not.toBeInTheDocument();
  });

  it('renders the entry title and its type-name annotation as separate lines, not glued together', async () => {
    // Regression: Text's default element for 'body-sm'/'meta' is an
    // inline <span> ("stay inline so callers can compose them freely" —
    // humanizeFieldKey.ts). Neither span here had `as="div"`, and their
    // shared wrapper is a plain (non-flex) <div>, so the browser rendered
    // them glued onto one line with no separator — "Monthly
    // CalendarPay Calendar" (same for every other section: "2026 Fiscal
    // AllowancesFiscal allowances", "2026 Band 1 (25%)PAYE band", ...).
    // Both must be block-level (`as="div"`) so they stack instead.
    mockEntriesList.mockResolvedValue([]);
    const entry = {
      id: 'e1',
      title: 'Monthly Calendar',
      type: 'pay_calendar',
      custom_fields: { cadence: 'monthly' },
    } as unknown as Entry;
    const entryTypes = [
      { id: 'et1', name: 'Pay calendar', form_schema: { fields: [] } },
    ] as unknown as EntryTypeNode[];

    renderHub(
      <SettingsHubWidget
        view={view([
          { key: 'pay_calendar', title: 'Pay Calendar', entry_type_keys: ['pay_calendar'], fields: [] },
        ])}
        entries={[entry]}
        isLoading={false}
        onEntryOpen={noop}
        onEntryCreate={async () => undefined}
        entryTypes={entryTypes}
      />,
    );

    const title = await screen.findByText('Monthly Calendar');
    const typeName = await screen.findByText('Pay calendar');
    expect(title.tagName).toBe('DIV');
    expect(typeName.tagName).toBe('DIV');
  });
});
