/**
 * InlineFieldEditor Vitest — inline edit affordance for text + number fields
 * in the entry detail panel (Task 6, UI review follow-ups).
 *
 * Covers:
 *  - read mode renders current value
 *  - click enters edit mode (input appears)
 *  - Enter commits the new value via onCommit
 *  - Escape cancels without calling onCommit
 *  - null/empty value shows placeholder dash
 *  - readOnly prop disables the click trigger
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { InlineFieldEditor } from '../InlineFieldEditor';
import type { OperationalModelFieldSpec } from '../../../types';

afterEach(() => {
  cleanup();
});

const textField: OperationalModelFieldSpec = {
  key: 'company',
  name: 'Company',
  type: 'text',
};

const numberField: OperationalModelFieldSpec = {
  key: 'headcount',
  name: 'Headcount',
  type: 'number',
};

describe('<InlineFieldEditor />', () => {
  it('shows value in read mode', () => {
    render(<InlineFieldEditor field={textField} value="Acme Corp" onCommit={vi.fn()} />);
    expect(screen.getByText('Acme Corp')).toBeInTheDocument();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });

  it('shows italic dash placeholder for null value', () => {
    render(<InlineFieldEditor field={textField} value={null} onCommit={vi.fn()} />);
    expect(screen.getByText('—')).toBeInTheDocument();
  });

  it('shows italic dash placeholder for empty string', () => {
    render(<InlineFieldEditor field={textField} value="" onCommit={vi.fn()} />);
    expect(screen.getByText('—')).toBeInTheDocument();
  });

  it('enters editing mode on click', () => {
    render(<InlineFieldEditor field={textField} value="Acme Corp" onCommit={vi.fn()} />);
    fireEvent.click(screen.getByRole('button'));
    expect(screen.getByRole('textbox')).toBeInTheDocument();
  });

  it('populates input with current value when editing starts', () => {
    render(<InlineFieldEditor field={textField} value="Acme Corp" onCommit={vi.fn()} />);
    fireEvent.click(screen.getByRole('button'));
    expect(screen.getByRole('textbox')).toHaveValue('Acme Corp');
  });

  it('calls onCommit with new value on Enter', async () => {
    const onCommit = vi.fn().mockResolvedValue(undefined);
    render(<InlineFieldEditor field={textField} value="Acme Corp" onCommit={onCommit} />);
    fireEvent.click(screen.getByRole('button'));
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Beta Corp' } });
    fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Enter' });
    await waitFor(() => expect(onCommit).toHaveBeenCalledWith('Beta Corp'));
  });

  it('calls onCommit with null when value is cleared', async () => {
    const onCommit = vi.fn().mockResolvedValue(undefined);
    render(<InlineFieldEditor field={textField} value="Acme Corp" onCommit={onCommit} />);
    fireEvent.click(screen.getByRole('button'));
    fireEvent.change(screen.getByRole('textbox'), { target: { value: '' } });
    fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Enter' });
    await waitFor(() => expect(onCommit).toHaveBeenCalledWith(null));
  });

  it('cancels on Escape without calling onCommit', () => {
    const onCommit = vi.fn();
    render(<InlineFieldEditor field={textField} value="Acme Corp" onCommit={onCommit} />);
    fireEvent.click(screen.getByRole('button'));
    fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Escape' });
    expect(onCommit).not.toHaveBeenCalled();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });

  it('returns to read mode after successful commit', async () => {
    const onCommit = vi.fn().mockResolvedValue(undefined);
    render(<InlineFieldEditor field={textField} value="Acme Corp" onCommit={onCommit} />);
    fireEvent.click(screen.getByRole('button'));
    fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Enter' });
    await waitFor(() => expect(screen.queryByRole('textbox')).not.toBeInTheDocument());
  });

  it('coerces number field value to Number on commit', async () => {
    const onCommit = vi.fn().mockResolvedValue(undefined);
    render(<InlineFieldEditor field={numberField} value={42} onCommit={onCommit} />);
    fireEvent.click(screen.getByRole('button'));
    fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '99' } });
    fireEvent.keyDown(screen.getByRole('spinbutton'), { key: 'Enter' });
    await waitFor(() => expect(onCommit).toHaveBeenCalledWith(99));
  });

  it('does not enter edit mode when readOnly=true', () => {
    render(
      <InlineFieldEditor field={textField} value="Acme Corp" onCommit={vi.fn()} readOnly />
    );
    const btn = screen.getByRole('button');
    fireEvent.click(btn);
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });

  it('renders a multi-line value with whitespace-pre-wrap', () => {
    const { container } = render(
      <InlineFieldEditor
        field={textField}
        value={'User: hi\nAgent: hello'}
        onCommit={vi.fn()}
      />
    );
    expect(container.querySelector('.whitespace-pre-wrap')).not.toBeNull();
  });

  it('uses a textarea for a multi-line value; Enter does not commit, Cmd+Enter does', async () => {
    const onCommit = vi.fn().mockResolvedValue(undefined);
    render(
      <InlineFieldEditor
        field={textField}
        value={'User: hi\nAgent: hello'}
        onCommit={onCommit}
      />
    );
    fireEvent.click(screen.getByRole('button'));
    const box = screen.getByRole('textbox');
    expect(box.tagName).toBe('TEXTAREA');

    fireEvent.keyDown(box, { key: 'Enter' });
    expect(onCommit).not.toHaveBeenCalled();

    fireEvent.keyDown(box, { key: 'Enter', metaKey: true });
    await waitFor(() => expect(onCommit).toHaveBeenCalled());
  });

  it('uses a textarea when the field is flagged multiline (even without newlines)', () => {
    const multilineField: OperationalModelFieldSpec = {
      key: 'history',
      name: 'History',
      type: 'text',
      multiline: true,
    };
    render(
      <InlineFieldEditor field={multilineField} value="one line" onCommit={vi.fn()} />
    );
    fireEvent.click(screen.getByRole('button'));
    expect(screen.getByRole('textbox').tagName).toBe('TEXTAREA');
  });

  it('still uses a single-line input for ordinary text fields', () => {
    render(<InlineFieldEditor field={textField} value="Acme Corp" onCommit={vi.fn()} />);
    fireEvent.click(screen.getByRole('button'));
    expect(screen.getByRole('textbox').tagName).toBe('INPUT');
  });
});
