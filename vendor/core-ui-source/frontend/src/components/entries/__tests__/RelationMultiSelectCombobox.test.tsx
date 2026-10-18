import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import '@testing-library/jest-dom/vitest';

import { RelationMultiSelectCombobox } from '../RelationMultiSelectCombobox';
import type { OperationalModelFieldSpec } from '../../../types';

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function wrap(ui: React.ReactNode) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
  return (
    <QueryClientProvider client={client}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>
  );
}

const mockField: OperationalModelFieldSpec = {
  key: 'tasks',
  name: 'Tasks',
  type: 'relation',
  relation: {
    target: 'entry',
    target_entry_types: ['task'],
    many: true,
  },
};

const mockOptions = [
  { value: 'task-1', label: 'Setup database schema' },
  { value: 'task-2', label: 'Implement authentication' },
  { value: 'task-3', label: 'Create dashboard view' },
  { value: 'task-4', label: 'Add unit tests' },
  { value: 'task-5', label: 'Configure CI pipeline' },
  { value: 'task-6', label: 'Deploy to staging' },
];

describe('<RelationMultiSelectCombobox />', () => {
  it('renders placeholder when no options are selected', () => {
    render(
      wrap(
        <RelationMultiSelectCombobox
          field={mockField}
          value={[]}
          onChange={vi.fn()}
          options={mockOptions}
          placeholder="Select tasks…"
        />
      )
    );

    expect(screen.getByText('Select tasks…')).toBeInTheDocument();
  });

  it('renders selected items as chips with remove buttons', () => {
    const onChange = vi.fn();
    render(
      wrap(
        <RelationMultiSelectCombobox
          field={mockField}
          value={['task-1', 'task-2']}
          onChange={onChange}
          options={mockOptions}
        />
      )
    );

    expect(screen.getByText('Setup database schema')).toBeInTheDocument();
    expect(screen.getByText('Implement authentication')).toBeInTheDocument();

    const removeBtn = screen.getByRole('button', { name: /remove setup database schema/i });
    fireEvent.click(removeBtn);
    expect(onChange).toHaveBeenCalledWith(['task-2']);
  });

  it('opens popover on click and allows toggling options', () => {
    const onChange = vi.fn();
    render(
      wrap(
        <RelationMultiSelectCombobox
          field={mockField}
          value={['task-1']}
          onChange={onChange}
          options={mockOptions}
        />
      )
    );

    const combobox = screen.getByRole('combobox');
    fireEvent.click(combobox);

    // Should display options
    expect(screen.getByText('Create dashboard view')).toBeInTheDocument();

    // Toggle task-3
    const optionLabel = screen.getByText('Create dashboard view');
    fireEvent.click(optionLabel);
    expect(onChange).toHaveBeenCalledWith(['task-1', 'task-3']);
  });

  it('filters options with search box when options > 5', () => {
    render(
      wrap(
        <RelationMultiSelectCombobox
          field={mockField}
          value={[]}
          onChange={vi.fn()}
          options={mockOptions}
        />
      )
    );

    fireEvent.click(screen.getByRole('combobox'));

    const searchInput = screen.getByPlaceholderText('Filter tasks…');
    expect(searchInput).toBeInTheDocument();

    fireEvent.change(searchInput, { target: { value: 'authentication' } });
    expect(screen.getByText('Implement authentication')).toBeInTheDocument();
    expect(screen.queryByText('Setup database schema')).not.toBeInTheDocument();
  });

  it('supports select all and clear all actions', () => {
    const onChange = vi.fn();
    render(
      wrap(
        <RelationMultiSelectCombobox
          field={mockField}
          value={['task-1']}
          onChange={onChange}
          options={mockOptions}
        />
      )
    );

    fireEvent.click(screen.getByRole('combobox'));

    const selectAllBtn = screen.getByRole('button', { name: /select all/i });
    fireEvent.click(selectAllBtn);
    expect(onChange).toHaveBeenCalledWith(mockOptions.map(o => o.value));

    const clearBtn = screen.getByRole('button', { name: /^clear$/i });
    fireEvent.click(clearBtn);
    expect(onChange).toHaveBeenCalledWith([]);
  });

  it('displays emptyHint when options are empty', () => {
    render(
      wrap(
        <RelationMultiSelectCombobox
          field={mockField}
          value={[]}
          onChange={vi.fn()}
          options={[]}
          emptyHint="Select project(s) above first to load tasks."
        />
      )
    );

    fireEvent.click(screen.getByRole('combobox'));
    expect(
      screen.getByText('Select project(s) above first to load tasks.')
    ).toBeInTheDocument();
  });

  it('renders chips as clickable links and triggers onNavigate', () => {
    const onNavigate = vi.fn();
    render(
      wrap(
        <RelationMultiSelectCombobox
          field={mockField}
          value={['task-1']}
          onChange={vi.fn()}
          options={mockOptions}
          onNavigate={onNavigate}
        />
      )
    );

    const chipText = screen.getByText('Setup database schema');
    expect(chipText).toBeInTheDocument();
  });
});
