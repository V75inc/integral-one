import { render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';
import { TagChip } from './TagChip';

it('uses a soft stored color with readable theme text', () => {
  const { container } = render(<TagChip label="Urgent" color="#ff3344" />);
  expect(screen.getByText('Urgent')).toBeInTheDocument();
  const chip = container.firstElementChild as HTMLElement;
  expect(chip.style.backgroundColor).toBe('rgba(255, 51, 68, 0.08)');
  expect(chip.style.color).toBe('var(--text)');
  expect(chip.textContent).toBe('Urgent');
});

it('uses a neutral treatment for invalid legacy colors', () => {
  const { container } = render(<TagChip label="Team" color="url(private)" />);
  expect(container.firstElementChild).not.toHaveAttribute('style');
  expect(container.firstElementChild).toHaveClass('bg-[var(--badge-muted-bg)]');
});

it('marks selection with a decorative check, not color alone', () => {
  const { container } = render(<TagChip label="Team" selected />);
  expect(container.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
});
