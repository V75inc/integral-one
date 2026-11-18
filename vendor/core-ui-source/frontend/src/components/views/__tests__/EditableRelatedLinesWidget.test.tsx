import {StrictMode, useState} from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const invokeOperation = vi.fn();

vi.mock('../../../api/extensions', async importOriginal => ({
  ...await importOriginal<typeof import('../../../api/extensions')>(),
  extensionsApi: { invokeOperation: (...args: unknown[]) => invokeOperation(...args) },
}));
vi.mock('../../../api/tools', () => ({ toolsApi: { call: vi.fn() } }));
vi.mock('../../../api', () => ({
  entriesApi: { listRelated: vi.fn(), delete: vi.fn() },
  tracksApi: { list: vi.fn() },
}));

import { entriesApi } from '../../../api';
import { EditableRelatedLinesWidget } from '../EditableRelatedLinesWidget';
import { ContributionLifecycleContext, type ContributionLifecycleHandle } from '../../entries/contributionLifecycle';
import type { ViewWidgetProps } from '../types';

type SavedView = ViewWidgetProps['view'];

function lineView(config: Record<string, unknown>): ViewWidgetProps {
  const view = {
    id: 'v1',
    name: 'Lines',
    view_type: 'region-system/editable-related-lines',
    config: {
      relation: 'invoice',
      columns: ['tax_code', 'discount_percent', 'line_amount'],
      quantity_field: 'quantity',
      rate_field: 'unit_price',
      amount_field: 'line_amount',
      currency_field: 'currency',
      __bindings: { __contributionMode: 'create', appId: 'app1', entryValues: {} },
      ...config,
    },
  } as unknown as SavedView;
  return { view, entries: [], isLoading: false, onEntryOpen: () => {} };
}

describe('EditableRelatedLinesWidget', () => {
  beforeEach(() => {
    invokeOperation.mockReset();
  });

  it('renders column_options as a picker fed by the App operation', async () => {
    invokeOperation.mockImplementation(async (_app: string, tool: string) =>
      tool === 'list_codes'
        ? { output: { rows: [{ id: 't1', code: 'VAT14', name: 'Standard' }] } }
        : { output: { items: [] } }
    );
    render(
      <EditableRelatedLinesWidget
        {...lineView({
          column_labels: { tax_code: 'Tax' },
          column_options: {
            tax_code: {
              tool: 'list_codes',
              input: { scope: 'sales' },
              items_key: 'rows',
              label_fields: ['code', 'name'],
            },
          },
        })}
      />
    );
    const picker = await screen.findByRole('combobox', { name: 'Tax' });
    await waitFor(() =>
      expect(within(picker).getByRole('option', { name: 'VAT14 Standard' })).toBeTruthy()
    );
    expect(invokeOperation).toHaveBeenCalledWith('app1', 'list_codes', { scope: 'sales' });
    expect(screen.getByRole('columnheader', { name: 'Discount percent' })).toBeTruthy();
  });

  it('uses the catalog currency and explains an empty catalog', async () => {
    invokeOperation.mockResolvedValue({ output: { items: [], currency: 'EUR' } });
    render(
      <EditableRelatedLinesWidget
        {...lineView({ list_catalog_tool: 'list_items', catalog_empty_hint: 'Add products first.' })}
      />
    );
    expect(await screen.findByText('Add products first.')).toBeTruthy();
    const expected = new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: 'EUR',
    }).format(0);
    await waitFor(() => expect(screen.getAllByText(expected).length).toBeGreaterThan(0));
  });

  it('does not show a blank placeholder line on a saved invoice with no lines', async () => {
    vi.mocked(entriesApi.listRelated).mockResolvedValue({
      entries: [],
      nextCursor: null,
      hasMore: false,
    });
    render(
      <EditableRelatedLinesWidget
        {...lineView({
          __bindings: {
            __contributionMode: 'detail',
            entryId: 'inv-1',
            appId: 'app1',
            entryValues: { total_amount: 6000 },
          },
        })}
      />
    );
    await waitFor(() => expect(entriesApi.listRelated).toHaveBeenCalled());
    expect(screen.queryByText('—')).toBeNull();
  });

  it('preserves recorded tool completion without preliminary deletion or retry', async () => {
    let handle: ContributionLifecycleHandle | undefined;
    vi.mocked(entriesApi.listRelated).mockResolvedValue({ entries: [], nextCursor: null, hasMore: false });
    invokeOperation.mockResolvedValue({
      output_disposition: 'withheld', current_state_verified: false,
      operation_receipt: { id: 'o.OperationExecutionReceipt.' + 'a'.repeat(64), status: 'succeeded', replayed: true },
    });
    render(
      <ContributionLifecycleContext.Provider value={{
        mode: 'edit', placement: 'entry_compose', entryId: 'parent-1', appId: 'app1', customFields: {},
        register: next => { handle = next; return () => {}; },
      }}>
        <EditableRelatedLinesWidget {...lineView({
          persist_mode: 'tool', persist_tool: 'persist_records', require_at_least_one: false,
          __bindings: { __contributionMode: 'edit', appId: 'app1', entryId: 'parent-1', entryValues: {} },
        })} />
      </ContributionLifecycleContext.Provider>,
    );
    await waitFor(() => expect(handle).toBeDefined());
    const result = await handle!.requestSubmit('parent-1');
    expect(result.ok).toBe(false);
    expect(result.outcomeRecorded).toBe(true);
    expect(result.error).toContain('completed earlier');
    expect(entriesApi.delete).not.toHaveBeenCalled();
    expect(invokeOperation).toHaveBeenCalledTimes(1);
  });
});

it('settles async tax totals when the parent echoes a new draft object', async () => {
  invokeOperation.mockResolvedValue({output: {items: [{id: 'standard', code: 'STANDARD', rate_percent: 14}]}});
  const patches = vi.fn();
  const props = lineView({parent_total_field: 'total', parent_tax_field: 'tax', tax_column: 'tax_code',
    column_options: {tax_code: {tool: 'list_codes'}}});
  function Host() {
    const [fields, setFields] = useState<Record<string, unknown>>({tax_inclusive: false});
    return <ContributionLifecycleContext.Provider value={{mode: 'create', placement: 'entry_compose', appId: 'app1', trackId: 'track1', customFields: fields,
      register: () => () => {}, onDraftPatch: patch => {
        patches(patch);
        if (patches.mock.calls.length > 5) throw new Error('Draft echo loop');
        setFields(previous => ({...previous, ...patch.custom_fields}));
      }}}><EditableRelatedLinesWidget {...props} /></ContributionLifecycleContext.Provider>;
  }
  render(<Host />);
  await waitFor(() => expect(patches).toHaveBeenCalled());
  expect(patches).toHaveBeenCalledTimes(1);
  expect(patches).toHaveBeenCalledWith(expect.objectContaining({custom_fields: {total: 0, tax: 0}}));
});

it('adds consecutive draft rows without updating the parent during render', () => {
  const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
  const patches = vi.fn();
  const props = lineView({parent_total_field: 'total'});
  function Host() {
    const [fields, setFields] = useState<Record<string, unknown>>({});
    return <ContributionLifecycleContext.Provider value={{mode: 'create', placement: 'entry_compose', customFields: fields, register: () => () => {},
      onDraftPatch: patch => {
        patches(patch);
        setFields(previous => ({...previous, ...patch.custom_fields}));
      }}}><EditableRelatedLinesWidget {...props} /></ContributionLifecycleContext.Provider>;
  }
  try {
    render(<StrictMode><Host /></StrictMode>);
    const add = screen.getByRole('button', {name: /add line/i});
    fireEvent.click(add);
    fireEvent.click(add);
    expect(patches.mock.lastCall?.[0].related.lines).toHaveLength(3);
    expect(errors.mock.calls.some(args => String(args[0]).includes('Cannot update a component'))).toBe(false);
  } finally {
    errors.mockRestore();
  }
});

it('resolves selected tax IDs through a declared read without zeroing totals while metadata is pending', async () => {
  const {AppUIProvider} = await import('@integral/sdk-react');
  let complete!: (value: any) => void;
  const query = vi.fn(() => new Promise<Record<string, unknown>>(resolve => {complete = resolve;}));
  const api = {query} as unknown as import('@integral/sdk-react').AppUI;
  const patch = vi.fn();
  let handle!: ContributionLifecycleHandle;
  invokeOperation.mockClear();
  render(<AppUIProvider value={api}><ContributionLifecycleContext.Provider value={{mode: 'create', placement: 'entry_compose', customFields: {total: 114, tax: 14, tax_inclusive: false}, onDraftPatch: patch, register: member => {handle = member; return () => {};}}}>
    <EditableRelatedLinesWidget {...lineView({defaults: {quantity: 1, unit_price: 100, tax_code: 'beyond-page'}, parent_total_field: 'total', parent_tax_field: 'tax', tax_column: 'tax_code', tax_inclusive_field: 'tax_inclusive', column_options: {tax_code: {query: 'declared_tax', tool: 'legacy_tax'}}})} />
  </ContributionLifecycleContext.Provider></AppUIProvider>);
  await waitFor(() => expect(query).toHaveBeenCalled());
  expect(query.mock.calls[0]).toEqual(['declared_tax', {ids: ['beyond-page'], limit: 50}, expect.any(AbortSignal)]);
  expect(invokeOperation).not.toHaveBeenCalled();
  expect(patch.mock.calls.every(([value]) => value.custom_fields.tax !== 0)).toBe(true);
  expect((await handle.requestValidate()).ok).toBe(false);
  await import('@testing-library/react').then(({act}) => act(async () => {complete({output: {items: [{id: 'beyond-page', label: 'VAT14', rate_percent: 14}]}});}));
  await waitFor(() => expect(screen.getByRole('combobox', {name: 'Tax code'})).toHaveValue('VAT14'));
  expect((await handle.requestValidate()).ok).toBe(true);
});


it.each([true, false])('retains returned line IDs while opting into the tool input schema: %s', async optIn => {
  let handle: ContributionLifecycleHandle | undefined;
  invokeOperation.mockReset();
  invokeOperation.mockResolvedValue({output: {line_ids: ['saved-line']}});
  render(
    <ContributionLifecycleContext.Provider value={{
      mode: 'create', placement: 'entry_compose', appId: 'app1', customFields: {},
      register: next => {handle = next; return () => {};},
    }}>
      <EditableRelatedLinesWidget {...lineView({
        persist_mode: 'tool', persist_tool: 'persist_records',
        ...(optIn ? {persist_line_id_field: 'entry_id'} : {}),
        defaults: {description: 'Synthetic row', quantity: 1, unit_price: 10},
      })} />
    </ContributionLifecycleContext.Provider>,
  );
  await waitFor(() => expect(handle).toBeDefined());
  await act(async () => {expect((await handle!.requestSubmit('parent-1')).ok).toBe(true);});
  expect(invokeOperation.mock.calls[invokeOperation.mock.calls.length - 1]?.[2].lines[0].entry_id).toBeUndefined();
  await act(async () => {expect((await handle!.requestSubmit('parent-1')).ok).toBe(true);});
  expect(invokeOperation.mock.calls[invokeOperation.mock.calls.length - 1]?.[2].lines[0].entry_id).toBe(optIn ? 'saved-line' : undefined);
});
