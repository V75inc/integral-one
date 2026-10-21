import { useState } from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';
import { TagLookupControl } from '../TagLookupControl';
function Control() {
  const [ids, setIds] = useState<string[]>([]);
  return (
    <TagLookupControl
      selectableTags={[
        { id: 'one', name: 'First' },
        { id: 'two', name: 'Second' },
      ]}
      selectedIds={ids}
      onChangeSelected={setIds}
    />
  );
}
it('reopens on a click in the still-focused input after selecting a tag', () => {
  render(<Control />);
  const input = screen.getByRole('textbox', { name: 'Add tags' });
  act(() => input.focus());
  fireEvent.click(screen.getByRole('option', { name: 'First' }));
  expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  fireEvent.click(input);
  fireEvent.click(screen.getByRole('option', { name: 'Second' }));
  expect(
    screen.getByRole('button', { name: 'Remove First' }),
  ).toBeInTheDocument();
  expect(
    screen.getByRole('button', { name: 'Remove Second' }),
  ).toBeInTheDocument();
});
it('assigns each picker its own results identity', () => {
  render(
    <>
      <Control />
      <Control />
    </>,
  );
  const [first, second] = screen.getAllByRole('textbox', { name: 'Add tags' });
  expect(first.getAttribute('aria-controls')).not.toBe(
    second.getAttribute('aria-controls'),
  );
});
