import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

const mockGet = vi.fn();
const mockUpdate = vi.fn();
const mockEntryTypesList = vi.fn();
const mockTracksList = vi.fn();
const mockToolsCall = vi.fn();
const mockShowToast = vi.fn();

vi.mock('../../../api', async importOriginal => {
  const actual = await importOriginal<typeof import('../../../api')>();
  return {
    ...actual,
    entriesApi: {
      ...actual.entriesApi,
      get: (id: string) => mockGet(id),
      update: (id: string, data: Record<string, unknown>) => mockUpdate(id, data),
      list: async () => [],
    },
    entryTypesApi: { ...actual.entryTypesApi, list: (p?: unknown) => mockEntryTypesList(p) },
    tracksApi: { ...actual.tracksApi, list: () => mockTracksList() },
  };
});

vi.mock('../../../api/tools', () => ({
  toolsApi: { call: (key: string, input: Record<string, unknown>) => mockToolsCall(key, input) },
}));

vi.mock('../../../context/ToastContext', () => ({
  useToast: () => ({ showToast: mockShowToast }),
}));

import { FormRegionWidget } from '../FormRegionWidget';
import type { SavedView } from '../../../types';

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const entryType = {
  id: 'et-1',
  name: 'schedule',
  form_schema: {
    _manifest_entry_type_key: 'nis_schedule',
    fields: [
      { key: 'employer_name', name: 'Employer Name', type: 'text' },
      { key: 'registration_number', name: 'Registration Number', type: 'text' },
    ],
  },
};

function baseView(config: Record<string, unknown>): SavedView {
  return {
    id: 'view-1',
    name: 'Schedule Header',
    type: 'form_region',
    track_id: 'track-1',
    default_entry_type_key: 'nis_schedule',
    config,
  };
}

describe('FormRegionWidget', () => {
  it('self bind mode: fetches the host entry and renders configured fields', async () => {
    mockEntryTypesList.mockResolvedValue([entryType]);
    mockGet.mockResolvedValue({
      id: 'entry-1',
      title: 'Schedule',
      custom_fields: { employer_name: 'Acme Co', registration_number: 'REG-1' },
    });

    render(
      <FormRegionWidget
        view={baseView({
          fields: ['employer_name', 'registration_number'],
          title: 'Header',
          __bindings: { entryId: 'entry-1' },
        })}
        entries={[]}
        isLoading={false}
        onEntryOpen={() => {}}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('Header')).toBeInTheDocument();
    });
    expect(mockGet).toHaveBeenCalledWith('entry-1');
    expect(screen.getByDisplayValue('Acme Co')).toBeInTheDocument();
    expect(screen.getByDisplayValue('REG-1')).toBeInTheDocument();
  });

  it('self bind mode: persists a field edit via entriesApi.update', async () => {
    mockEntryTypesList.mockResolvedValue([entryType]);
    mockGet.mockResolvedValue({
      id: 'entry-1',
      title: 'Schedule',
      custom_fields: { employer_name: 'Acme Co', registration_number: 'REG-1' },
    });
    mockUpdate.mockResolvedValue({
      id: 'entry-1',
      title: 'Schedule',
      custom_fields: { employer_name: 'New Name', registration_number: 'REG-1' },
    });

    render(
      <FormRegionWidget
        view={baseView({
          fields: ['employer_name', 'registration_number'],
          __bindings: { entryId: 'entry-1' },
        })}
        entries={[]}
        isLoading={false}
        onEntryOpen={() => {}}
      />
    );

    const input = await screen.findByDisplayValue('Acme Co');
    fireEvent.change(input, { target: { value: 'New Name' } });
    fireEvent.blur(input);

    await waitFor(() => {
      expect(mockUpdate).toHaveBeenCalledWith('entry-1', {
        custom_fields: { employer_name: 'New Name' },
      });
    });
  });

  it('tool bind mode: resolves a related entry via a workspace tool and renders it editable', async () => {
    mockEntryTypesList.mockResolvedValue([entryType]);
    mockToolsCall.mockResolvedValue({ output: { entry_id: 'comp-1' } });
    mockGet.mockResolvedValue({
      id: 'comp-1',
      title: 'Compensation',
      custom_fields: { employer_name: 'From Tool', registration_number: '' },
    });

    render(
      <FormRegionWidget
        view={baseView({
          fields: ['employer_name'],
          __bindings: { entryId: 'entry-1', entry: 'tool', tool: 'get_compensation' },
        })}
        entries={[]}
        isLoading={false}
        onEntryOpen={() => {}}
      />
    );

    await waitFor(() => {
      expect(mockToolsCall).toHaveBeenCalledWith('get_compensation', { entry_id: 'entry-1' });
    });
    expect(screen.getByDisplayValue('From Tool')).toBeInTheDocument();
  });

  it('anchored bind mode: reads the first entry already delivered via props', async () => {
    mockEntryTypesList.mockResolvedValue([entryType]);

    render(
      <FormRegionWidget
        view={baseView({
          fields: ['employer_name'],
          __bindings: { entry: 'anchored' },
        })}
        entries={[
          {
            id: 'anchor-1',
            title: 'Anchored entry',
            custom_fields: { employer_name: 'Anchored Value' },
          } as never,
        ]}
        isLoading={false}
        onEntryOpen={() => {}}
      />
    );

    await waitFor(() => {
      expect(screen.getByDisplayValue('Anchored Value')).toBeInTheDocument();
    });
    expect(mockGet).not.toHaveBeenCalled();
  });

  it('detail mode: fields are read-only (view until pencil edit)', async () => {
    mockEntryTypesList.mockResolvedValue([entryType]);
    mockGet.mockResolvedValue({
      id: 'entry-1',
      title: 'Schedule',
      custom_fields: { employer_name: 'Acme Co' },
    });

    const { ContributionLifecycleContext } = await import(
      '../../entries/contributionLifecycle'
    );

    render(
      <ContributionLifecycleContext.Provider
        value={{
          mode: 'detail',
          placement: 'entry_detail',
          appId: 'app-1',
          entryId: 'entry-1',
          customFields: { employer_name: 'Acme Co' },
          register: () => () => {},
        }}
      >
        <FormRegionWidget
          view={baseView({
            fields: ['employer_name'],
            title: 'Header',
            __bindings: { entryId: 'entry-1' },
          })}
          entries={[]}
          isLoading={false}
          onEntryOpen={() => {}}
        />
      </ContributionLifecycleContext.Provider>
    );

    const input = await screen.findByDisplayValue('Acme Co');
    expect(input).toBeDisabled();
    fireEvent.change(input, { target: { value: 'Edited' } });
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('detail mode: editable_in_detail fields stay writable', async () => {
    const invoiceType = {
      id: 'et-inv',
      name: 'invoice',
      form_schema: {
        _manifest_entry_type_key: 'invoice',
        fields: [
          { key: 'invoice_number', name: 'Invoice no.', type: 'text' },
          {
            key: 'status',
            name: 'Status',
            type: 'select',
            enum: ['draft', 'sent', 'paid'],
          },
        ],
      },
    };
    mockEntryTypesList.mockResolvedValue([invoiceType]);
    mockGet.mockResolvedValue({
      id: 'inv-1',
      title: 'INV-0001',
      custom_fields: { invoice_number: 'INV-0001', status: 'draft' },
    });
    mockUpdate.mockResolvedValue({
      id: 'inv-1',
      title: 'INV-0001',
      custom_fields: { invoice_number: 'INV-0001', status: 'sent' },
    });

    const { ContributionLifecycleContext } = await import(
      '../../entries/contributionLifecycle'
    );

    render(
      <ContributionLifecycleContext.Provider
        value={{
          mode: 'detail',
          placement: 'entry_detail',
          appId: 'app-1',
          entryId: 'inv-1',
          customFields: { invoice_number: 'INV-0001', status: 'draft' },
          register: () => () => {},
        }}
      >
        <FormRegionWidget
          view={{
            ...baseView({
              fields: [
                'invoice_number',
                { key: 'status', editable_in_detail: true },
              ],
              __bindings: { entryId: 'inv-1' },
            }),
            default_entry_type_key: 'invoice',
          }}
          entries={[]}
          isLoading={false}
          onEntryOpen={() => {}}
        />
      </ContributionLifecycleContext.Provider>
    );

    const numberInput = await screen.findByDisplayValue('INV-0001');
    expect(numberInput).toBeDisabled();

    const statusTrigger = await screen.findByRole('combobox', { name: /Status/i });
    expect(statusTrigger).not.toBeDisabled();
    fireEvent.click(statusTrigger);
    const sentOption = await screen.findByRole('option', { name: /^Sent$/i });
    fireEvent.click(sentOption);
    await waitFor(() => {
      expect(mockUpdate).toHaveBeenCalledWith('inv-1', {
        custom_fields: { status: 'sent' },
      });
    });
  });

  it('draft bind: reads lifecycle.customFields and patches via onDraftPatch (no entriesApi)', async () => {
    mockEntryTypesList.mockResolvedValue([entryType]);
    const onDraftPatch = vi.fn();

    const { ContributionLifecycleContext } = await import(
      '../../entries/contributionLifecycle'
    );

    render(
      <ContributionLifecycleContext.Provider
        value={{
          mode: 'create',
          placement: 'entry_compose',
          customFields: { employer_name: 'Draft Co', registration_number: '' },
          onDraftPatch,
          register: () => () => {},
        }}
      >
        <FormRegionWidget
          view={baseView({
            fields: ['employer_name'],
            title: 'Header',
          })}
          entries={[]}
          isLoading={false}
          onEntryOpen={() => {}}
        />
      </ContributionLifecycleContext.Provider>
    );

    const input = await screen.findByDisplayValue('Draft Co');
    expect(mockGet).not.toHaveBeenCalled();

    fireEvent.change(input, { target: { value: 'Patched Co' } });
    fireEvent.blur(input);

    await waitFor(() => {
      expect(onDraftPatch).toHaveBeenCalledWith({
        custom_fields: { employer_name: 'Patched Co' },
      });
    });
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('draft bind: leaves hide_on_create fields out of the create form', async () => {
    mockEntryTypesList.mockResolvedValue([
      {
        ...entryType,
        form_schema: {
          ...entryType.form_schema,
          fields: [
            entryType.form_schema.fields[0],
            { ...entryType.form_schema.fields[1], hide_on_create: true },
          ],
        },
      },
    ]);
    const { ContributionLifecycleContext } = await import(
      '../../entries/contributionLifecycle'
    );

    render(
      <ContributionLifecycleContext.Provider
        value={{
          mode: 'create',
          placement: 'entry_compose',
          customFields: { employer_name: 'Draft Co', registration_number: 'R-1' },
          onDraftPatch: vi.fn(),
          register: () => () => {},
        }}
      >
        <FormRegionWidget
          view={baseView({ fields: ['employer_name', 'registration_number'] })}
          entries={[]}
          isLoading={false}
          onEntryOpen={() => {}}
        />
      </ContributionLifecycleContext.Provider>
    );

    await screen.findByDisplayValue('Draft Co');
    expect(screen.queryByDisplayValue('R-1')).not.toBeInTheDocument();
  });
});
