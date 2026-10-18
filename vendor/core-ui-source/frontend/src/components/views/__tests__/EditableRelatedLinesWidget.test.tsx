import { render, screen, waitFor, within } from '@testing-library/react';
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
