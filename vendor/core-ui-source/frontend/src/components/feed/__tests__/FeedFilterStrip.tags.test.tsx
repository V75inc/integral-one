import { fireEvent, render, screen, within } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { FeedFilterStrip } from '../FeedFilterStrip';
vi.mock('../../ui/AppSelect', () => ({
  AppSelect: ({ options, onValueChange, value, ...props }: any) => (
    <select
      {...props}
      value={value}
      onChange={(event) => onValueChange(event.target.value)}
    >
      {options.map((option: any) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  ),
}));
it('offers distinct same-named tags with their owning Track and exact ID', () => {
  const select = vi.fn();
  render(
    <FeedFilterStrip
      appIdFromQuery=""
      setAppFilter={vi.fn()}
      apps={[]}
      appName={null}
      filterTrack=""
      setFilterTrack={vi.fn()}
      tracks={
        [
          { id: 'one', title: 'First' },
          { id: 'two', title: 'Second' },
        ] as any
      }
      filterType=""
      setFilterType={vi.fn()}
      typeOptions={[]}
      feedSearch=""
      setFeedSearch={vi.fn()}
      tags={[
        { id: 'a', name: 'Urgent', track_id: 'one' },
        { id: 'b', name: 'Urgent', track_id: 'two' },
      ]}
      setFilterTag={select}
    />,
  );
  fireEvent.click(screen.getByRole('button', { name: 'Filters' }));
  const control = screen.getByRole('combobox', { name: 'Filter feed by tag' });
  expect(
    within(control).getByRole('option', { name: 'Urgent · First' }),
  ).toHaveValue('a');
  expect(
    within(control).getByRole('option', { name: 'Urgent · Second' }),
  ).toHaveValue('b');
  fireEvent.change(control, { target: { value: 'b' } });
  expect(select).toHaveBeenCalledWith('b');
});
