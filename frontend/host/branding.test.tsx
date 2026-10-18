import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { Logo } from '../components/ui/Logo';

describe('Integral One distribution branding', () => {
  it('keeps Integral and adds a quiet one suffix with an accessible name', () => {
    const { container, getByRole } = render(<MemoryRouter><Logo to="/" /></MemoryRouter>);
    expect(getByRole('link', { name: 'Integral One — go to dashboard' })).toBeTruthy();
    expect(container.textContent).toBe('Integral|one');
    expect(container.querySelector('svg')).toBeTruthy();
    expect(container.querySelector('[aria-hidden="true"].opacity-50')).toBeTruthy();
  });
  it('retains only the original mark on a collapsed rail', () => {
    const { container, getByRole } = render(<MemoryRouter><Logo to="/" markOnly /></MemoryRouter>);
    expect(getByRole('link', { name: 'Integral One — go to dashboard' })).toBeTruthy();
    expect(container.textContent).toBe('');
  });
});
