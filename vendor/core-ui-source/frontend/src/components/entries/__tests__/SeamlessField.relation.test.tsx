import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SeamlessField } from '../SeamlessField';
import type { OperationalModelFieldSpec } from '../../../types';

vi.mock('../relations', () => ({
  useRelationLabels: () => ({ targets: [{ label: 'Current opportunity' }] }),
  RelationValue: () => <a href="/entries/current">Current opportunity</a>,
}));
afterEach(cleanup);

describe('optional select clearing', () => {
  const field: OperationalModelFieldSpec = {
    key: 'status', name: 'Status', type: 'select', enum: ['new', 'done'],
  };

  it('clears a selected optional value with the mouse', async () => {
    const user = userEvent.setup();
    const change = vi.fn();
    const view = render(<SeamlessField field={field} value="new" onChange={change} />);
    await user.click(screen.getByRole('combobox'));
    await user.click(screen.getByRole('option', { name: 'None' }));
    expect(change).toHaveBeenCalledWith('');
    view.rerender(<SeamlessField field={field} value="" onChange={change} />);
    expect(screen.getByRole('combobox')).toHaveValue('None');
  });

  it('clears a selected optional value with keyboard search and Enter', async () => {
    const user = userEvent.setup();
    const change = vi.fn();
    render(<SeamlessField field={field} value="done" onChange={change} />);
    await user.click(screen.getByRole('combobox'));
    await user.type(screen.getByRole('combobox'), 'None{Enter}');
    expect(change).toHaveBeenCalledWith('');
  });

  it('keeps required selects from offering an unset value', async () => {
    const user = userEvent.setup();
    render(<SeamlessField field={{ ...field, required: true }} value="new" onChange={vi.fn()} />);
    await user.click(screen.getByRole('combobox'));
    expect(screen.queryByRole('option', { name: 'None' })).toBeNull();
  });

  it('disables clearing for a readonly field', () => {
    render(<SeamlessField field={{ ...field, readonly: true }} value="new" onChange={vi.fn()} />);
    expect(screen.getByRole('combobox')).toBeDisabled();
  });
});

const field: OperationalModelFieldSpec = {
  key: 'opportunity', name: 'Opportunity', type: 'relation',
  relation: { target: 'entry', many: false }, required: true,
};
const choices = [
  { value: 'current', label: 'Current opportunity' },
  { value: 'next', label: 'Next opportunity' },
];

describe('single relation display and editing', () => {
  it('uses a configured default label when clearing an optional relation', () => {
    const change = vi.fn();
    const optional = { ...field, required: false, placeholder: 'Use default' };
    const view = render(<SeamlessField field={optional} value="current" onChange={change} relationChoices={choices} />);
    fireEvent.click(screen.getByRole('button', { name: 'Change Opportunity' }));
    fireEvent.click(screen.getByRole('button', { name: 'Opportunity' }));
    fireEvent.click(screen.getByRole('option', { name: 'Use default' }));
    expect(change).toHaveBeenCalledWith(null);
    view.rerender(<SeamlessField field={optional} value={null} onChange={change} relationChoices={choices} />);
    expect(screen.getByRole('button', { name: 'Opportunity' })).toHaveTextContent('Use default');
  });

  it('shows one linked value and opens the selector only when editing', () => {
    const change = vi.fn();
    render(<SeamlessField field={field} value="current" onChange={change} relationChoices={choices} />);
    expect(screen.getAllByText('Current opportunity')).toHaveLength(1);
    expect(screen.getByRole('link')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Opportunity (required)' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Change Opportunity' }));
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Opportunity (required)' }));
    fireEvent.click(screen.getByRole('option', { name: 'Next opportunity' }));
    expect(change).toHaveBeenCalledWith('next');
  });

  it('cancels editing without changing the relation', () => {
    const change = vi.fn();
    render(<SeamlessField field={field} value="current" onChange={change} relationChoices={choices} />);
    fireEvent.click(screen.getByRole('button', { name: 'Change Opportunity' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel editing Opportunity' }));
    expect(screen.getAllByText('Current opportunity')).toHaveLength(1);
    expect(screen.getByRole('link')).toBeVisible();
    expect(change).not.toHaveBeenCalled();
  });

  it('keeps read-only relations linked without an editor', () => {
    render(<SeamlessField field={{ ...field, readonly: true }} value="current" onChange={vi.fn()} relationChoices={choices} />);
    expect(screen.getByRole('link')).toBeVisible();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});

describe('many relation trigger stability', () => {
  it('keeps an empty optional relation label present before pointer entry', () => {
    render(<SeamlessField field={{ ...field, name: 'Sources', required: false, relation: { target: 'entry', many: true } }} value={[]} onChange={vi.fn()} relationChoices={choices} />);
    const trigger = screen.getByRole('combobox', { name: 'Sources' });
    expect(screen.getByText('Sources')).toBeVisible();
    fireEvent.mouseEnter(trigger);
    fireEvent.click(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByLabelText('Next opportunity')).toBeVisible();
  });
});

describe('select fields are searchable by default', () => {
  const selectField: OperationalModelFieldSpec = {
    key: 'pipeline_status',
    name: 'Pipeline status',
    type: 'select',
    enum: ['new', 'contacted'],
  };

  it('renders one combobox (no separate search field)', () => {
    render(<SeamlessField field={selectField} value="new" onChange={vi.fn()} />);
    const combo = screen.getByRole('combobox', { name: 'Pipeline status' });
    fireEvent.focus(combo);
    expect(screen.getByRole('option', { name: 'New' })).toBeTruthy();
    expect(screen.queryByLabelText('Search options')).toBeNull();
  });

  it('omits the placeholder option from the list', () => {
    render(<SeamlessField field={selectField} value="new" onChange={vi.fn()} />);
    fireEvent.focus(screen.getByRole('combobox', { name: 'Pipeline status' }));
    expect(screen.getByRole('option', { name: 'Contacted' })).toBeTruthy();
    expect(
      screen.queryByRole('option', { name: /Enter Pipeline status/i })
    ).toBeNull();
  });

  it('hides the inner floating label when the caller owns the label', () => {
    render(
      <SeamlessField field={selectField} value="new" onChange={vi.fn()} externalLabel />
    );
    expect(screen.queryByText('Pipeline status')).toBeNull();
  });

  it('shows the inner floating label when the caller does not own it', () => {
    render(<SeamlessField field={selectField} value="new" onChange={vi.fn()} />);
    expect(screen.getByText('Pipeline status')).toBeTruthy();
  });
});
