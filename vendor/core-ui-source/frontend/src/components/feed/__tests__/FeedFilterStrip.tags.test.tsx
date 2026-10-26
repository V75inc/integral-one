import { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { FeedFilterStrip } from '../FeedFilterStrip';

function FilterHarness() {
  const [tags, setTags] = useState<string[]>([]);
  return <FeedFilterStrip appIdFromQuery="" setAppFilter={vi.fn()} apps={[]} appName={null}
    filterTrack="" setFilterTrack={vi.fn()} tracks={[{ id: 'one', title: 'First' }, { id: 'two', title: 'Second' }] as any}
    filterType="" setFilterType={vi.fn()} typeOptions={[]} feedSearch="" setFeedSearch={vi.fn()}
    tags={[{ id: 'a', name: 'Urgent', track_id: 'one' }, { id: 'b', name: 'Urgent', track_id: 'two' }]}
    filterTags={tags} setFilterTags={setTags} />;
}

it('keeps multiple exact tag IDs selected and supports individual removal and clear', () => {
  render(<FilterHarness />);
  fireEvent.click(screen.getByRole('button', { name: /^Filters/ }));
  const first = screen.getByRole('checkbox', { name: 'Urgent · First' });
  const second = screen.getByRole('checkbox', { name: 'Urgent · Second' });
  fireEvent.click(first);
  fireEvent.click(second);
  expect(first).toBeChecked();
  expect(second).toBeChecked();
  fireEvent.click(first);
  expect(first).not.toBeChecked();
  expect(second).toBeChecked();
  fireEvent.click(screen.getByRole('button', { name: 'Clear tag filters (1)' }));
  expect(second).not.toBeChecked();
});

it('resets every filter through the atomic parent callback rather than competing URL writes', () => {
  const clearAll = vi.fn();
  const setApp = vi.fn();
  const setTags = vi.fn();
  const setTrack = vi.fn();
  const setType = vi.fn();
  render(<FeedFilterStrip appIdFromQuery="app-a" setAppFilter={setApp}
    apps={[{ id: 'app-a', name: 'Selected App' }] as any} appName="Selected App"
    filterTrack="track-a" setFilterTrack={setTrack} tracks={[]}
    filterType="task" setFilterType={setType} typeOptions={['task']}
    feedSearch="search" setFeedSearch={vi.fn()} filterAuthor="author-a"
    filterTags={['tag-a', 'tag-b']} setFilterTags={setTags} onClearAll={clearAll} />);
  fireEvent.click(screen.getByRole('button', { name: /^Filters/ }));
  fireEvent.click(screen.getByRole('button', { name: 'Reset filters' }));
  expect(clearAll).toHaveBeenCalledTimes(1);
  expect(setApp).not.toHaveBeenCalled();
  expect(setTags).not.toHaveBeenCalled();
  expect(setTrack).not.toHaveBeenCalled();
  expect(setType).not.toHaveBeenCalled();
});
