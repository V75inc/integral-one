import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { AppSelect } from '../AppSelect';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const options = [
  { value: 'new', label: 'New' },
  { value: 'contacted', label: 'Contacted' },
];

function openList(rect: { top: number; bottom: number }, innerHeight = 800) {
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
    top: rect.top,
    bottom: rect.bottom,
    left: 10,
    right: 210,
    width: 200,
    height: rect.bottom - rect.top,
    x: 10,
    y: rect.top,
    toJSON: () => ({}),
  } as DOMRect);
  vi.stubGlobal('innerHeight', innerHeight);

  render(
    <AppSelect
      value="new"
      onValueChange={() => {}}
      options={options}
      aria-label="Pipeline status"
    />
  );
  fireEvent.click(screen.getByRole('button', { name: 'Pipeline status' }));
  return screen.getByRole('listbox');
}

it('opens upward when there is no room below the trigger', () => {
  const list = openList({ top: 700, bottom: 740 }, 800);
  expect(list.style.bottom).not.toBe('');
  expect(list.style.top).toBe('');
});

it('opens downward when there is room below', () => {
  const list = openList({ top: 40, bottom: 80 }, 800);
  expect(list.style.top).toBe('84px');
  expect(list.style.bottom).toBe('');
});

it('is one combobox: opening shows all options, typing filters, Enter selects', () => {
  const onValueChange = vi.fn();
  vi.stubGlobal('innerHeight', 800);
  render(
    <AppSelect
      value="new"
      onValueChange={onValueChange}
      options={options}
      searchable
      aria-label="Pipeline status"
    />
  );

  const combo = screen.getByRole('combobox', { name: 'Pipeline status' });
  // No separate search field inside the list.
  expect(screen.queryByLabelText('Search options')).toBeNull();

  fireEvent.focus(combo);
  expect(screen.getByRole('option', { name: 'New' })).toBeTruthy();
  expect(screen.getByRole('option', { name: 'Contacted' })).toBeTruthy();

  fireEvent.change(combo, { target: { value: 'cont' } });
  expect(screen.queryByRole('option', { name: 'New' })).toBeNull();
  expect(screen.getByRole('option', { name: 'Contacted' })).toBeTruthy();

  fireEvent.keyDown(combo, { key: 'Enter' });
  expect(onValueChange).toHaveBeenCalledWith('contacted');
});
