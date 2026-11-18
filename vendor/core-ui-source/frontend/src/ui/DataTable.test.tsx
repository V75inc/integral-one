import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { DataTable, type DataTableColumn } from './DataTable';
import { Tabs } from './Tabs';
import { StatusBadge } from './StatusBadge';

type Row = { id: string; name: string; gross: number | null };
const rows: Row[] = [
  { id: 'a', name: 'Cara', gross: 300 }, { id: 'b', name: 'Ann', gross: 1200 }, { id: 'c', name: 'Bob', gross: null }, { id: 'd', name: 'Dee', gross: 50 },
];
const columns: DataTableColumn<Row>[] = [
  { key: 'name', label: 'Name', sortable: true, pinned: true, width: '8rem' },
  { key: 'gross', label: 'Gross', sortable: true, align: 'end', render: r => (r.gross == null ? '' : r.gross.toFixed(2)), total: '1,550.00' },
];
const names = () => screen.getAllByRole('row').slice(1, -1).map(r => within(r).getAllByRole('cell')[0].textContent);

describe('DataTable', () => {
  it('shows every row, names the table, right-aligns amounts and shows the totals row', () => {
    render(<DataTable columns={columns} rows={rows} rowKey={r => r.id} caption="Register" />);
    expect(screen.getByRole('table', { name: 'Register' })).toBeTruthy();
    expect(names()).toEqual(['Cara', 'Ann', 'Bob', 'Dee']);
    expect(screen.getByText('1200.00').className).toContain('text-right');
    expect(screen.getByText('1,550.00')).toBeTruthy();
  });

  it('sorts on the header, descending on a second click, and keeps empty values last', () => {
    render(<DataTable columns={columns} rows={rows} rowKey={r => r.id} caption="Register" />);
    fireEvent.click(screen.getByRole('button', { name: 'Gross' }));
    expect(names()).toEqual(['Dee', 'Cara', 'Ann', 'Bob']);
    fireEvent.click(screen.getByRole('button', { name: 'Gross' }));
    expect(names()).toEqual(['Ann', 'Cara', 'Dee', 'Bob']);
    expect(screen.getByRole('columnheader', { name: 'Gross' }).getAttribute('aria-sort')).toBe('descending');
    fireEvent.click(screen.getByRole('button', { name: 'Gross' }));
    expect(names()).toEqual(['Cara', 'Ann', 'Bob', 'Dee']); // third click clears the sort
  });

  it('pages, and goes back to the first page when the sort changes', () => {
    render(<DataTable columns={columns} rows={rows} rowKey={r => r.id} caption="Register" pageSize={3} />);
    expect(screen.getByText('Showing 1–3 of 4')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByText('Showing 4–4 of 4')).toBeTruthy();
    expect(names()).toEqual(['Dee']);
    fireEvent.click(screen.getByRole('button', { name: 'Name' }));
    expect(screen.getByText('Showing 1–3 of 4')).toBeTruthy();
    expect(names()).toEqual(['Ann', 'Bob', 'Cara']);
  });

  it('pins the leading column and opens a row on click or Enter', () => {
    const open = vi.fn();
    render(<DataTable columns={columns} rows={rows} rowKey={r => r.id} caption="Register" onRowClick={open} />);
    const first = screen.getAllByRole('row')[1];
    expect(within(first).getAllByRole('cell')[0].style.position).toBe('sticky');
    fireEvent.click(first);
    fireEvent.keyDown(first, { key: 'Enter' });
    expect(open).toHaveBeenCalledTimes(2);
    expect(open.mock.calls[0][0]).toMatchObject({ id: 'a' });
  });

  it('says so when there are no rows', () => {
    render(<DataTable columns={columns} rows={[]} rowKey={r => r.id} caption="Register" empty="No one is on this run." />);
    expect(screen.getByText('No one is on this run.')).toBeTruthy();
  });
});

describe('Tabs and StatusBadge', () => {
  it('switches tabs and shows counts', () => {
    const change = vi.fn();
    render(<Tabs ariaLabel="Sections" options={[{ value: 'register', label: 'Register', count: 70 }, { value: 'journal', label: 'Journal' }]} value="register" onChange={change} />);
    expect(screen.getByText('70')).toBeTruthy();
    fireEvent.click(screen.getByRole('tab', { name: /Journal/ }));
    expect(change).toHaveBeenCalledWith('journal');
  });

  it('shows its label', () => {
    render(<StatusBadge tone="success">Approved</StatusBadge>);
    expect(screen.getByText('Approved')).toBeTruthy();
  });
});

describe('DataTable sheet features', () => {
  type P = { id: string; name: string; kind: 'employee' | 'consultant'; basic: number; net: number; bad?: boolean };
  const people: P[] = [
    { id: '1', name: 'Ann', kind: 'employee', basic: 100, net: 80 }, { id: '2', name: 'Bob', kind: 'employee', basic: 200, net: 150, bad: true },
    { id: '3', name: 'Cy', kind: 'consultant', basic: 300, net: 300 },
  ];
  const sum = (key: 'basic' | 'net') => (list: P[]) => String(list.reduce((t, r) => t + r[key], 0));
  const cols: DataTableColumn<P>[] = [
    { key: 'name', label: 'Employee', pinned: 'start', width: '10rem', total: 'Total' },
    { key: 'basic', label: 'Basic', align: 'end', group: 'earn', total: sum('basic') },
    { key: 'net', label: 'Net pay', align: 'end', group: 'pay', pinned: 'end', width: '8rem', total: sum('net') },
  ];
  const groups = [{ key: 'earn', label: 'Earnings' }, { key: 'pay', label: 'Pay' }];

  it('shows group headings, labels the right-pinned columns and sticks them to the right', () => {
    render(<DataTable columns={cols} rows={people} rowKey={r => r.id} caption="Register" groups={groups} />);
    expect(screen.getByRole('columnheader', { name: 'Earnings' })).toBeTruthy();
    expect(screen.getByRole('columnheader', { name: 'Pinned' })).toBeTruthy();
    const cells = within(screen.getAllByRole('row')[2]).getAllByRole('cell');
    expect(cells[2].style.position).toBe('sticky');
    expect(cells[2].style.right).toBe('0rem');
  });

  it('adds section rows with subtotals and a grand total using each column total', () => {
    render(<DataTable columns={cols} rows={people} rowKey={r => r.id} caption="Register" groups={groups} sectionBy={r => (r.kind === 'employee' ? 'Employees' : 'Consultants')} sectionTotals />);
    expect(screen.getByText('Employees')).toBeTruthy();
    expect(screen.getByText('Employees subtotal')).toBeTruthy();
    expect(screen.getByText('Consultants subtotal')).toBeTruthy();
    expect(screen.getAllByText('300').length).toBeGreaterThan(1); // employee basic subtotal and the consultant row
    expect(screen.getByText('Total')).toBeTruthy();
    expect(screen.getByText('600')).toBeTruthy(); // grand total basic
  });

  it('lets people hide columns and use a preset, and remembers the choice', () => {
    localStorage.clear();
    const { unmount } = render(<DataTable columns={cols} rows={people} rowKey={r => r.id} caption="Register" groups={groups} columnPicker={{ presets: [{ label: 'Money only', keys: ['net'] }], persistKey: 'test-columns' }} />);
    fireEvent.click(screen.getByRole('button', { name: 'Columns' }));
    fireEvent.click(screen.getByRole('button', { name: 'Money only' }));
    expect(screen.queryByRole('columnheader', { name: 'Basic' })).toBeNull();
    expect(screen.getByRole('columnheader', { name: 'Net pay' })).toBeTruthy();
    unmount();
    render(<DataTable columns={cols} rows={people} rowKey={r => r.id} caption="Register" groups={groups} columnPicker={{ persistKey: 'test-columns' }} />);
    expect(screen.queryByRole('columnheader', { name: 'Basic' })).toBeNull(); // remembered
  });

  it('lets people pin a column to the right', () => {
    render(<DataTable columns={cols} rows={people} rowKey={r => r.id} caption="Register" groups={groups} pinnable />);
    fireEvent.click(screen.getByRole('button', { name: 'Pin Basic' }));
    const header = screen.getByRole('columnheader', { name: /Basic/ });
    expect(header.style.position).toBe('sticky');
    expect(header.style.right).not.toBe('');
  });

  it('tints a row that needs attention', () => {
    render(<DataTable columns={cols} rows={people} rowKey={r => r.id} caption="Register" rowTone={r => (r.bad ? 'danger' : undefined)} />);
    const bad = screen.getByText('Bob').closest('tr') as HTMLElement;
    const ok = screen.getByText('Ann').closest('tr') as HTMLElement;
    expect(within(bad).getAllByRole('cell')[0].style.background).toContain('danger-bg');
    expect(within(ok).getAllByRole('cell')[0].style.background).not.toContain('danger-bg');
  });
});

describe('DataTable width', () => {
  it('keeps a 600px minimum unless the App asks for less', () => {
    const cols: DataTableColumn<{ id: string; a: string }>[] = [{ key: 'a', label: 'A' }];
    const { rerender } = render(<DataTable columns={cols} rows={[{ id: '1', a: 'x' }]} rowKey={r => r.id} caption="T" />);
    expect(screen.getByRole('table').style.minWidth).toBe('600px');
    rerender(<DataTable columns={cols} rows={[{ id: '1', a: 'x' }]} rowKey={r => r.id} caption="T" minWidth="0" />);
    expect(['0', '0px']).toContain(screen.getByRole('table').style.minWidth);
  });
});
