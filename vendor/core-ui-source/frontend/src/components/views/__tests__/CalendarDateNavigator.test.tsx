import { describe, it, expect, afterEach, vi, beforeEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { useRef, useState } from 'react';
import { format } from 'date-fns';
import { CalendarDateNavigator } from '../CalendarDateNavigator';

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

function Harness({
  initialDate = new Date(2026, 4, 15),
}: {
  initialDate?: Date;
}) {
  const anchorRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(true);
  const [date, setDate] = useState(initialDate);

  return (
    <>
      <button ref={anchorRef} type="button">
        May 2026
      </button>
      <CalendarDateNavigator
        anchorRef={anchorRef}
        currentDate={date}
        open={open}
        onClose={() => setOpen(false)}
        onSelect={setDate}
      />
      <span data-testid="selected">{date.toISOString()}</span>
    </>
  );
}

describe('CalendarDateNavigator', () => {
  it('shows a 12-month grid for the current year', () => {
    render(<Harness />);
    expect(screen.getByRole('dialog', { name: /choose month and year/i })).toBeInTheDocument();
    expect(screen.getByRole('grid', { name: /months in 2026/i })).toBeInTheDocument();
    expect(screen.getByRole('gridcell', { name: /may 2026/i })).toBeInTheDocument();
  });

  it('selects a month and closes', () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole('gridcell', { name: /july 2026/i }));
    const selected = screen.getByTestId('selected').textContent ?? '';
    expect(selected).toContain('2026-07-15');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('opens year grid when the year label is clicked', () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: /2026, choose year/i }));
    expect(screen.getByRole('grid', { name: /years 2020 to 2031/i })).toBeInTheDocument();
  });

  /**
   * The visual state moved out of conditional Tailwind literals and into
   * calendar-date-navigator.css, which keys off `aria-pressed` (selected)
   * and `data-current` (this month / this year). jsdom applies no
   * stylesheet, so these assert the TSX half of that contract — the
   * attributes the CSS selectors depend on. Without them, dropping
   * `data-current` would silently un-highlight today while every existing
   * test stayed green.
   *
   * `data-current` is derived from the real clock inside the component, so
   * the expectations are computed the same way rather than hardcoded — a
   * literal month would rot the moment the calendar rolled over.
   */
  it('marks the selected month with aria-pressed and this month with data-current', () => {
    render(<Harness />);

    // Harness selects May 2026 (month index 4).
    const may = screen.getByRole('gridcell', { name: /may 2026/i });
    expect(may).toHaveClass('calendar-navigator-cell');
    expect(may).toHaveAttribute('aria-pressed', 'true');

    const july = screen.getByRole('gridcell', { name: /july 2026/i });
    expect(july).toHaveAttribute('aria-pressed', 'false');

    const now = new Date();
    const currentCells = screen
      .getAllByRole('gridcell')
      .filter(c => c.getAttribute('data-current') === 'true');

    if (now.getFullYear() === 2026) {
      // Exactly one cell in the displayed year is "this month", and it is
      // the one whose label names the current month.
      expect(currentCells).toHaveLength(1);
      expect(currentCells[0]).toHaveAttribute(
        'aria-label',
        format(new Date(2026, now.getMonth(), 1), 'MMMM yyyy'),
      );
    } else {
      // Grid is showing a year that isn't the current one — nothing is current.
      expect(currentCells).toHaveLength(0);
    }
  });

  it('marks the selected year with aria-pressed and this year with data-current', () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: /2026, choose year/i }));

    const y2026 = screen.getByRole('gridcell', { name: '2026' });
    expect(y2026).toHaveAttribute('aria-pressed', 'true');

    const y2028 = screen.getByRole('gridcell', { name: '2028' });
    expect(y2028).toHaveAttribute('aria-pressed', 'false');

    const thisYear = String(new Date().getFullYear());
    const cell = screen.queryByRole('gridcell', { name: thisYear });
    if (cell) expect(cell).toHaveAttribute('data-current', 'true');
    expect(y2028).not.toHaveAttribute('data-current');
  });

  it('selects a year then a month', () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: /2026, choose year/i }));
    fireEvent.click(screen.getByRole('gridcell', { name: '2028' }));
    expect(screen.getByRole('grid', { name: /months in 2028/i })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('gridcell', { name: /march 2028/i }));
    const selected = screen.getByTestId('selected').textContent ?? '';
    expect(selected).toContain('2028-03-15');
  });
});
