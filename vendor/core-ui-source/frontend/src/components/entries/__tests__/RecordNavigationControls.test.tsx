import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { RecordNavigationControls } from '../RecordNavigationControls';

const navigation = () => ({ canPrevious: true, canNext: true, busy: false,
  label: 'Record 2 on page 1', cancel: vi.fn(), previous: vi.fn(), next: vi.fn() });
describe('RecordNavigationControls', () => {
  it('offers accessible previous and next actions', () => {
    const nav = navigation(); render(<RecordNavigationControls navigation={nav} />);
    fireEvent.click(screen.getByRole('button', { name: 'Previous record' }));
    fireEvent.click(screen.getByRole('button', { name: 'Next record' }));
    expect(nav.previous).toHaveBeenCalledOnce(); expect(nav.next).toHaveBeenCalledOnce();
    expect(screen.getByRole('status')).toHaveTextContent('Record 2 on page 1');
  });
  it.each(['draft', 'loading', 'boundary'])('blocks actions for %s', reason => {
    const nav = navigation();
    if (reason === 'loading') nav.busy = true;
    if (reason === 'boundary') { nav.canNext = false; nav.canPrevious = false; }
    render(<RecordNavigationControls navigation={nav} disabled={reason === 'draft'} />);
    const previous = screen.getByRole('button', { name: 'Previous record' });
    const next = screen.getByRole('button', { name: 'Next record' });
    expect(previous).toBeDisabled(); expect(next).toBeDisabled();
    fireEvent.click(previous); fireEvent.click(next);
    expect(nav.previous).not.toHaveBeenCalled(); expect(nav.next).not.toHaveBeenCalled();
  });
});
