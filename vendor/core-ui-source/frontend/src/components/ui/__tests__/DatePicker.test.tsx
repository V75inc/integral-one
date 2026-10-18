import { describe, it, expect, afterEach, vi, beforeEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom/vitest';
import { DatePicker } from '../DatePicker';

afterEach(() => cleanup());

beforeEach(() => {
  vi.stubGlobal(
    'ResizeObserver',
    vi.fn(() => ({
      observe: vi.fn(),
      unobserve: vi.fn(),
      disconnect: vi.fn(),
    }))
  );
});

describe('DatePicker', () => {
  it('shows placeholder when empty', () => {
    render(
      <DatePicker mode="date" value="" onChange={() => {}} placeholder="Pick a day" />
    );
    expect(screen.getByPlaceholderText('Pick a day')).toBeInTheDocument();
  });

  /**
   * Input tone moved from conditional Tailwind literals to data-attributes
   * resolved in date-picker.css (an <input> has no child node for <Text>
   * to wrap). jsdom applies no stylesheet, so this asserts the TSX half of
   * that contract: the attributes the CSS selectors key off.
   */
  it('flags the empty state on the input so CSS can mute it', () => {
    const { rerender } = render(
      <DatePicker mode="date" value="" onChange={() => {}} placeholder="Pick a day" />
    );
    const input = screen.getByPlaceholderText('Pick a day');
    expect(input).toHaveClass('integral-date-picker-input');
    expect(input).toHaveAttribute('data-empty', 'true');

    rerender(
      <DatePicker mode="date" value="2026-07-15" onChange={() => {}} placeholder="Pick a day" />
    );
    // A filled field reads at full strength, not muted.
    expect(screen.getByRole('textbox')).not.toHaveAttribute('data-empty');
  });

  it('does not open when disabled', () => {
    render(
      <DatePicker mode="date" value="" onChange={() => {}} disabled placeholder="Pick" />
    );
    fireEvent.click(screen.getByLabelText('Open calendar'));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('selecting a day emits yyyy-MM-dd', () => {
    const onChange = vi.fn();
    render(<DatePicker mode="date" value="" onChange={onChange} />);
    fireEvent.click(screen.getByLabelText('Open calendar'));
    const dayButtons = screen.getAllByRole('gridcell');
    const enabled = dayButtons.find(
      el => el.getAttribute('aria-disabled') !== 'true' && el.textContent?.trim() === '15'
    );
    expect(enabled).toBeTruthy();
    fireEvent.click(enabled!.querySelector('button')!);
    expect(onChange).toHaveBeenCalled();
    const stored = onChange.mock.calls[0][0] as string;
    expect(stored).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('clear resets value', () => {
    const onChange = vi.fn();
    render(
      <DatePicker mode="date" value="2026-06-02" onChange={onChange} aria-label="Due" />
    );
    fireEvent.click(screen.getByLabelText('Clear date'));
    expect(onChange).toHaveBeenCalledWith('');
  });

  it('manual entry accepts yyyy-MM-dd on Enter', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<DatePicker mode="date" value="" onChange={onChange} aria-label="Birthday" />);
    const input = screen.getByLabelText('Birthday');
    await user.click(input);
    await user.type(input, '1990-03-15{Enter}');
    expect(onChange).toHaveBeenCalledWith('1990-03-15');
  });

  it('manual entry accepts US slash format on blur', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<DatePicker mode="date" value="" onChange={onChange} aria-label="Birthday" />);
    const input = screen.getByLabelText('Birthday');
    await user.click(input);
    await user.type(input, '3/15/1990');
    fireEvent.blur(input);
    expect(onChange).toHaveBeenCalledWith('1990-03-15');
  });

  it('opens month picker from header', () => {
    render(<DatePicker mode="date" value="2026-06-02" onChange={() => {}} />);
    fireEvent.click(screen.getByLabelText('Open calendar'));
    fireEvent.click(
      screen.getByRole('button', { name: /june 2026, choose month and year/i })
    );
    expect(screen.getByRole('grid', { name: /months in 2026/i })).toBeInTheDocument();
  });

  it('displays human-readable format when not focused, and dd/MM/yyyy when focused', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <DatePicker mode="date" value="2026-08-07" onChange={onChange} aria-label="DatePicker" />
    );
    const input = screen.getByLabelText('DatePicker') as HTMLInputElement;
    expect(input.value).toBe('7th August, 2026');

    await user.click(input);
    expect(input.value).toBe('07/08/2026');

    fireEvent.blur(input);
    expect(input.value).toBe('7th August, 2026');
  });

  it('immediately updates the display value after selecting a date from calendar', async () => {
    const onChange = vi.fn();
    const { rerender } = render(
      <DatePicker mode="date" value="" onChange={onChange} aria-label="DatePicker" />
    );

    fireEvent.click(screen.getByLabelText('Open calendar'));
    const dayButtons = screen.getAllByRole('gridcell');
    const enabled = dayButtons.find(
      el => el.getAttribute('aria-disabled') !== 'true' && el.textContent?.trim() === '15'
    );
    expect(enabled).toBeTruthy();
    fireEvent.click(enabled!.querySelector('button')!);

    expect(onChange).toHaveBeenCalled();
    const stored = onChange.mock.calls[0][0] as string;

    // Rerender with the new value from parent state
    rerender(
      <DatePicker mode="date" value={stored} onChange={onChange} aria-label="DatePicker" />
    );

    // The input should display the selected date in editable format (since it is focused after selection)
    const input = screen.getByLabelText('DatePicker') as HTMLInputElement;
    const parts = stored.split('-');
    const expected = `${parts[2]}/${parts[1]}/${parts[0]}`;
    expect(input.value).toBe(expected);
  });
});
