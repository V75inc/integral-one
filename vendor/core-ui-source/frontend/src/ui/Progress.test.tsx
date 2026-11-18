import {render, screen} from '@testing-library/react';
import {expect, it} from 'vitest';
import {Progress} from './Progress';
it('shows how far work has got and says what is progressing', () => {
  render(<Progress value={40} ariaLabel="Calculating pay" />);
  const bar = screen.getByRole('progressbar', {name: 'Calculating pay'});
  expect(bar).toHaveAttribute('aria-valuenow', '40');
  expect((bar.firstElementChild as HTMLElement).style.width).toBe('40%');
});
it('slides when the amount is not known and keeps a sliver visible near zero', () => {
  const {rerender} = render(<Progress ariaLabel="Working" />);
  const bar = screen.getByRole('progressbar', {name: 'Working'});
  expect(bar).not.toHaveAttribute('aria-valuenow');
  expect(bar.firstElementChild).toHaveClass('integral-progress-unknown');
  rerender(<Progress value={0} ariaLabel="Working" />);
  expect((screen.getByRole('progressbar').firstElementChild as HTMLElement).style.width).toBe('2%');
});
