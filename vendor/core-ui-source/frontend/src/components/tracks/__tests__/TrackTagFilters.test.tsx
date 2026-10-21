import { expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { TrackTagFilters, entriesMatchingTags } from '../TrackTagFilters';
import type { Entry } from '../../../types';
import { tagColorStyle } from '../../../utils/tagColor';

const entries = [
  {
    id: 'one',
    tags: [
      { id: 'a', name: 'Urgent', color: '#ff3344' },
      { id: 'b', name: 'Team' },
    ],
  },
  { id: 'two', tags: [{ id: 'b', name: 'Team' }] },
  { id: 'three', tags: [] },
] as Entry[];
it('filters by one or all selected tags and clears completely', () => {
  expect(entriesMatchingTags(entries, ['b']).map((entry) => entry.id)).toEqual([
    'one',
    'two',
  ]);
  expect(
    entriesMatchingTags(entries, ['a', 'b']).map((entry) => entry.id),
  ).toEqual(['one']);
  expect(entriesMatchingTags(entries, ['missing'])).toEqual([]);
  expect(entriesMatchingTags(entries, [])).toEqual(entries);
  const onChange = vi.fn();
  render(
    <TrackTagFilters entries={entries} selected={['b']} onChange={onChange} />,
  );
  fireEvent.click(screen.getByRole('button', { name: 'Filter by tag Urgent' }));
  expect(onChange).toHaveBeenCalledWith(['b', 'a']);
  fireEvent.click(screen.getByRole('button', { name: 'Clear tag filters' }));
  expect(onChange).toHaveBeenCalledWith([]);
});
it('uses only validated stored hex colors', () => {
  expect(tagColorStyle('#ff3344')?.border).toContain('#ff3344');
  expect(tagColorStyle('url(private)')).toBeUndefined();
});

it('has clean tag chips without a redundant visible label', () => {
  render(
    <TrackTagFilters entries={entries} selected={['b']} onChange={vi.fn()} />,
  );
  const filters = screen.getByRole('group', { name: 'Filter by tags' });
  expect(filters).not.toHaveTextContent('Tags');
  expect(
    screen.getByRole('button', { name: 'Filter by tag Team' }),
  ).toHaveAttribute('aria-pressed', 'true');
  expect(
    screen.getByRole('button', { name: 'Clear tag filters' }),
  ).toHaveTextContent('Clear (1)');
  expect(
    screen.getByRole('button', { name: 'Filter by tag Urgent' }),
  ).toHaveTextContent('Urgent');
});
