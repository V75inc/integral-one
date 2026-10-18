import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import type { OperationalModelFieldSpec, Entry, SavedView } from '../../../types';

import { TableWidget } from '../TableWidget';

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function view(config: Record<string, unknown>): SavedView {
  return {
    id: 'v-1',
    name: 'Employees',
    type: 'table',
    track_id: 'employees-track',
    config,
  } as SavedView;
}

const noop = () => {};

describe('TableWidget column labels', () => {
  it('uses field labels when saved columns omit labels, preserving explicit labels', () => {
    render(<TableWidget entries={[]} onEntryOpen={noop} isLoading={false}
      fields={[{ key: 'payment_date', name: 'Payment Date', type: 'date' }, { key: 'amount', name: 'Amount', type: 'number' }]}
      view={view({ columns: [{ field: 'custom_fields.payment_date' }, { field: 'amount', label: 'Paid total' }, { field: 'created_at' }, { field: 'custom_fields.reference_code' }] })} />);
    for (const label of ['Payment Date', 'Paid total', 'Date', 'Reference code']) {
      expect(screen.getByRole('columnheader', { name: label })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: label, pressed: true })).toBeInTheDocument();
    }
  });

  it('treats blank and non-string labels as absent without changing field values', () => {
    render(<TableWidget entries={[{ id: 'e1', custom_fields: { amount: 42 } } as unknown as Entry]} onEntryOpen={noop} isLoading={false}
      fields={[{ key: 'amount', name: 'Amount', type: 'number' }]}
      view={view({ columns: [{ field: 'custom_fields.amount', label: '  ' }, { field: 'updated_at', label: null }] })} />);
    expect(screen.getByRole('columnheader', { name: 'Amount' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Updated at' })).toBeInTheDocument();
    expect(screen.getByRole('cell', { name: '42' })).toBeInTheDocument();
  });
});

describe('TableWidget select-field rendering', () => {
  it("humanizes a select field's raw stored value, matching every other select control in the app", () => {
    // payroll-app's employee `status` is exactly this shape: a select field
    // (enum: active/inactive/…) stored lowercase — the create form's own
    // select control shows "Active" (SeamlessField's resolveEnumOptionLabel/
    // humanizeEnumValue), but the table cell used to print the raw stored
    // value verbatim since the default cell renderer had no way to know
    // `custom_fields.status` was select-typed at all.
    const entries: Entry[] = [
      {
        id: 'e1',
        title: 'Ava Persaud',
        status: 'archived',
        custom_fields: { status: 'active' },
      } as unknown as Entry,
    ];
    const fields: OperationalModelFieldSpec[] = [
      { key: 'status', name: 'Status', type: 'select', enum: ['active', 'inactive'] },
    ];

    render(
      <TableWidget
        view={view({
          columns: [{ field: 'custom_fields.status', label: 'Status' }],
        })}
        entries={entries}
        fields={fields}
        isLoading={false}
        onEntryOpen={noop}
      />
    );

    expect(screen.getAllByText('Active').length).toBeGreaterThan(0);
    expect(screen.queryByText('active')).not.toBeInTheDocument();
  });

  it('humanizes every value of a multi_select field and joins them', () => {
    const entries: Entry[] = [
      {
        id: 'e1',
        title: 'Ava Persaud',
        custom_fields: { departments: ['warehouse_ops', 'night_shift'] },
      } as unknown as Entry,
    ];
    const fields: OperationalModelFieldSpec[] = [
      {
        key: 'departments',
        name: 'Departments',
        type: 'multi_select',
        enum: ['warehouse_ops', 'night_shift'],
      },
    ];

    render(
      <TableWidget
        view={view({
          columns: [{ field: 'custom_fields.departments', label: 'Departments' }],
        })}
        entries={entries}
        fields={fields}
        isLoading={false}
        onEntryOpen={noop}
      />
    );

    expect(screen.getAllByText('Warehouse ops, Night shift').length).toBeGreaterThan(0);
  });

  it('leaves a plain text field alone — humanization is opt-in to select/multi_select only', () => {
    const entries: Entry[] = [
      { id: 'e1', title: 'Ava Persaud', custom_fields: { job_title: 'warehouse supervisor' } } as unknown as Entry,
    ];
    const fields: OperationalModelFieldSpec[] = [
      { key: 'job_title', name: 'Job title', type: 'text' },
    ];

    render(
      <TableWidget
        view={view({
          columns: [{ field: 'custom_fields.job_title', label: 'Job title' }],
        })}
        entries={entries}
        fields={fields}
        isLoading={false}
        onEntryOpen={noop}
      />
    );

    expect(screen.getAllByText('warehouse supervisor').length).toBeGreaterThan(0);
  });
});


describe('TableWidget column choices', () => {
  it('starts sibling views with their prescribed columns and preserves each view choice', () => {
    const first = view({ columns: [{ field: 'title', label: 'Title' }, { field: 'custom_fields.customer', label: 'Customer' }] });
    const second = { ...view({ columns: [{ field: 'title', label: 'Item' }, { field: 'custom_fields.status', label: 'Readiness' }] }), id: 'v-2' };
    const props = { entries: [], fields: [], isLoading: false, onEntryOpen: noop };
    const { rerender } = render(<TableWidget {...props} view={first} />);
    fireEvent.click(screen.getByRole('button', { name: 'Customer', pressed: true }));
    expect(screen.queryByRole('columnheader', { name: 'Customer' })).not.toBeInTheDocument();
    rerender(<TableWidget {...props} view={second} />);
    expect(screen.getByRole('columnheader', { name: 'Readiness' })).toBeInTheDocument();
    rerender(<TableWidget {...props} view={first} />);
    expect(screen.getByRole('button', { name: 'Customer' })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.queryByRole('columnheader', { name: 'Customer' })).not.toBeInTheDocument();
  });

  it('shows newly prescribed columns after the same view schema changes', () => {
    const first = view({ columns: [{ field: 'title', label: 'Title' }] });
    const props = { entries: [], fields: [], isLoading: false, onEntryOpen: noop };
    const { rerender } = render(<TableWidget {...props} view={first} />);
    const revised = view({ columns: [{ field: 'title', label: 'Title' }, { field: 'custom_fields.owner', label: 'Owner' }] });
    rerender(<TableWidget {...props} view={revised} />);
    expect(screen.getByRole('columnheader', { name: 'Owner' })).toBeInTheDocument();
  });
});
