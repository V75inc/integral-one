import type { ReactElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
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

vi.mock('../ExtensionViewWidget', () => ({
  ExtensionViewWidget: (props: { view: { config?: { extension_view_key?: string; component_key?: string } } }) => (
    <div data-testid="app-screen" data-component={props.view.config?.component_key || ''}>{props.view.config?.extension_view_key}</div>
  ),
}));

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

  it('shows names and numbers as plain values and only choices as tags', async () => {
    mockEntriesList.mockResolvedValue([]);
    const entry = {
      id: 'e1',
      title: 'Employer',
      type: 'company_profile',
      custom_fields: { employer_name: 'Acme INC', nis_number: 123456, cadence: 'monthly' },
    } as unknown as Entry;
    const entryTypes = [
      {
        id: 'et1',
        name: 'Employer',
        form_schema: {
          fields: [
            { key: 'employer_name', name: 'Employer', type: 'text' },
            { key: 'nis_number', name: 'NIS registration', type: 'number' },
            { key: 'cadence', name: 'Cadence', type: 'select', enum: ['monthly', 'weekly'] },
          ],
        },
      },
    ] as unknown as EntryTypeNode[];

    renderHub(
      <SettingsHubWidget
        view={view([
          {
            key: 'employer',
            title: 'Employer',
            entry_type_keys: ['company_profile'],
            fields: [
              { key: 'employer_name', label: 'Employer', type: 'value' },
              { key: 'nis_number', label: 'NIS registration', type: 'value' },
              { key: 'cadence', label: 'Cadence', type: 'value' },
            ],
          },
        ])}
        entries={[entry]}
        isLoading={false}
        onEntryOpen={noop}
        onEntryCreate={async () => undefined}
        entryTypes={entryTypes}
      />,
    );

    const name = await screen.findByText('Acme INC');
    const number = screen.getByText('123456');
    const choice = screen.getByText('Monthly');
    // Badges are rounded tag chips; plain values are not.
    expect(name.className).not.toContain('rounded-md');
    expect(number.className).not.toContain('rounded-md');
    expect(choice.className).toContain('rounded-md');
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

const baseProps = { entries: [] as Entry[], isLoading: false, onEntryOpen: noop, entryTypes: [] as EntryTypeNode[] };

function splitView(sections: Record<string, unknown>[]): SavedView {
  const v = view(sections);
  (v.config as Record<string, unknown>).variant = 'split';
  return v;
}

describe('SettingsHubWidget split layout', () => {
  const sections = [
    { key: 'start', title: 'Start here', group: 'Get started', extension_view_key: 'setup_checklist' },
    { key: 'employer', title: 'Employer', group: 'Employer and payments', entry_type_keys: ['company_profile'] },
    { key: 'banks', title: 'Banks', group: 'Employer and payments', entry_type_keys: ['bank'] },
    { key: 'rates', title: 'Statutory rates', group: 'Tax and pay rules', extension_view_key: 'pay_rules' },
  ];
  const employer = { id: 'e1', title: 'Acme Ltd', type: 'company_profile', custom_fields: {} } as unknown as Entry;

  it('lists sections under their group headings, each heading once', async () => {
    mockEntriesList.mockResolvedValue([]);
    renderHub(<SettingsHubWidget {...baseProps} view={splitView(sections)} onEntryCreate={async () => undefined} />);
    const nav = await screen.findByRole('navigation', { name: 'Settings sections' });
    expect(nav).toHaveTextContent('Get started');
    expect(nav).toHaveTextContent('Employer and payments');
    expect(nav).toHaveTextContent('Tax and pay rules');
    expect(nav.textContent?.match(/Employer and payments/g)).toHaveLength(1);
  });

  it('makes each group a labelled region so a heading is not mistaken for an item', async () => {
    mockEntriesList.mockResolvedValue([]);
    renderHub(<SettingsHubWidget {...baseProps} view={splitView(sections)} onEntryCreate={async () => undefined} />);
    const group = await screen.findByRole('group', { name: /Employer and payments/i });
    expect(group).toHaveTextContent('Employer');
    expect(screen.queryByRole('button', { name: /^Employer and payments$/i })).toBeNull(); // the heading is not a button
  });

  it('shows set up or not set up for record sections and nothing for App screens', async () => {
    mockEntriesList.mockResolvedValue([employer]);
    renderHub(<SettingsHubWidget {...baseProps} entries={[employer]} view={splitView(sections)} onEntryCreate={async () => undefined} />);
    await screen.findByRole('navigation', { name: 'Settings sections' });
    expect(screen.getAllByLabelText('Set up')).toHaveLength(1);        // Employer has a record
    expect(screen.getAllByLabelText('Not set up yet')).toHaveLength(1); // Banks has none
  });

  it('shows an App screen in the detail pane when its section is chosen', async () => {
    mockEntriesList.mockResolvedValue([]);
    renderHub(<SettingsHubWidget {...baseProps} view={splitView(sections)} onEntryCreate={async () => undefined} />);
    expect((await screen.findByTestId('app-screen')).textContent).toBe('setup_checklist');
    fireEvent.click(screen.getByRole('button', { name: /Statutory rates/ }));
    expect(screen.getByTestId('app-screen').textContent).toBe('pay_rules');
  });

  it('passes a section\'s React component to the screen, with its iframe view as the fallback', async () => {
    mockEntriesList.mockResolvedValue([]);
    const withComponent = [{ key: 'start', title: 'Start here', group: 'Get started', extension_view_key: 'setup_checklist', component_key: 'setup_react' }];
    renderHub(<SettingsHubWidget {...baseProps} view={splitView(withComponent)} onEntryCreate={async () => undefined} />);
    const screenEl = await screen.findByTestId('app-screen');
    expect(screenEl.textContent).toBe('setup_checklist');
    expect(screenEl.getAttribute('data-component')).toBe('setup_react');
  });

  it('marks the open section for assistive technology', async () => {
    mockEntriesList.mockResolvedValue([]);
    renderHub(<SettingsHubWidget {...baseProps} view={splitView(sections)} onEntryCreate={async () => undefined} />);
    const open = await screen.findByRole('button', { name: /Start here/ });
    expect(open).toHaveAttribute('aria-current', 'true');
  });

  it('gives an empty record section a next step', async () => {
    mockEntriesList.mockResolvedValue([]);
    const create = vi.fn(async () => undefined);
    renderHub(<SettingsHubWidget {...baseProps} view={splitView(sections)} onEntryCreate={create} />);
    fireEvent.click(await screen.findByRole('button', { name: /Banks/ }));
    expect(await screen.findByText('Nothing is set up here yet.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Set up banks/i }));
    expect(create).toHaveBeenCalled();
  });

  it('offers "Add another" once a section already has a record', async () => {
    mockEntriesList.mockResolvedValue([employer]);
    renderHub(<SettingsHubWidget {...baseProps} entries={[employer]} view={splitView(sections)} onEntryCreate={async () => undefined} />);
    fireEvent.click(await screen.findByRole('button', { name: /Employer/ }));
    expect(await screen.findByRole('button', { name: /Add another/i })).toBeInTheDocument();
  });

  it('draws no generic header when the view does not name itself', async () => {
    mockEntriesList.mockResolvedValue([]);
    const v = splitView(sections);
    (v.config as Record<string, unknown>).title = undefined;
    renderHub(<SettingsHubWidget {...baseProps} view={v} onEntryCreate={async () => undefined} />);
    await screen.findByRole('navigation', { name: 'Settings sections' });
    expect(screen.queryByRole('heading', { name: 'App settings' })).toBeNull();
  });
});

describe('SettingsHubWidget keeps its original look unless an app asks for the split layout', () => {
  const sections = [{ key: 'employer', title: 'Employer', group: 'Employer and payments', entry_type_keys: ['company_profile'] }];

  it('shows the generic header, a record count and no group headings', async () => {
    mockEntriesList.mockResolvedValue([]);
    renderHub(<SettingsHubWidget {...baseProps} view={view(sections)} onEntryCreate={async () => undefined} />);
    expect(await screen.findByRole('heading', { name: 'App settings' })).toBeInTheDocument();
    const nav = screen.getByRole('navigation', { name: 'Settings sections' });
    expect(nav).not.toHaveTextContent('Employer and payments');
    expect(screen.queryByLabelText('Not set up yet')).toBeNull();
  });

  it('keeps the original empty-section message and plain Add button', async () => {
    mockEntriesList.mockResolvedValue([]);
    renderHub(<SettingsHubWidget {...baseProps} view={view(sections)} onEntryCreate={async () => undefined} />);
    expect(await screen.findByText('No records have been configured in this section yet.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Add Company Profile$/i })).toBeInTheDocument();
  });
});

describe('SettingsHubWidget opens records in the dialog and avoids double buttons (split layout)', () => {
  const entryTypes = [{ id: 'et1', name: 'Company profile', form_schema: { singleton: true } }] as unknown as EntryTypeNode[];
  const sections = [{ key: 'employer', title: 'Employer', entry_type_keys: ['company_profile'] }, { key: 'banks', title: 'Banks', entry_type_keys: ['bank'] }];
  const profile = { id: 'p1', title: 'Acme', type: 'company_profile', custom_fields: {} } as unknown as Entry;

  it('asks for the dialog when editing a record', async () => {
    mockEntriesList.mockResolvedValue([profile]);
    const open = vi.fn();
    renderHub(<SettingsHubWidget {...baseProps} entries={[profile]} entryTypes={entryTypes} onEntryOpen={open} view={splitView(sections)} onEntryCreate={async () => undefined} />);
    fireEvent.click(await screen.findByRole('button', { name: /Edit/ }));
    expect(open).toHaveBeenCalledWith(profile, { forceModal: true });
  });

  it('does not ask for the dialog in the original layout', async () => {
    mockEntriesList.mockResolvedValue([profile]);
    const open = vi.fn();
    renderHub(<SettingsHubWidget {...baseProps} entries={[profile]} entryTypes={entryTypes} onEntryOpen={open} view={view(sections)} onEntryCreate={async () => undefined} />);
    fireEvent.click(await screen.findByRole('button', { name: /Edit/ }));
    expect(open).toHaveBeenCalledWith(profile, undefined);
  });

  it('offers no Add on a one-record type that already has its record', async () => {
    mockEntriesList.mockResolvedValue([profile]);
    renderHub(<SettingsHubWidget {...baseProps} entries={[profile]} entryTypes={entryTypes} view={splitView(sections)} onEntryCreate={async () => undefined} />);
    await screen.findByRole('button', { name: /Edit/ });
    expect(screen.queryByRole('button', { name: /Add/i })).toBeNull();
  });

  it('offers no Add on a section the app marks as holding one record', async () => {
    mockEntriesList.mockResolvedValue([profile]);
    const one = [{ key: 'employer', title: 'Employer', single: true, entry_type_keys: ['company_profile'] }];
    renderHub(<SettingsHubWidget {...baseProps} entries={[profile]} entryTypes={[]} view={splitView(one)} onEntryCreate={async () => undefined} />);
    await screen.findByRole('button', { name: /Edit/ });
    expect(screen.queryByRole('button', { name: /Add/i })).toBeNull();
  });

  it('shows one button, not two, on an empty section', async () => {
    mockEntriesList.mockResolvedValue([]);
    renderHub(<SettingsHubWidget {...baseProps} view={splitView(sections)} onEntryCreate={async () => undefined} />);
    fireEvent.click(await screen.findByRole('button', { name: /Banks/ }));
    await screen.findByText('Nothing is set up here yet.');
    expect(screen.getAllByRole('button', { name: /Add|Set up/i }).filter(b => !b.closest('nav'))).toHaveLength(1);
  });
});
