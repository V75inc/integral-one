import { useState } from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { TrackFilterStrip } from '../TrackFilterStrip';
import type { Entry } from '../../../types';

function Filters() {
  const [tags, setTags] = useState<string[]>([]);
  const [type, setType] = useState('');
  const [search, setSearch] = useState('');
  return (
    <TrackFilterStrip
      filterType={type}
      setFilterType={setType}
      entryTypeSlugs={['task']}
      search={search}
      setSearch={setSearch}
      selectedTags={tags}
      onTagsChange={setTags}
      tagEntries={
        [
          {
            id: 'record',
            tags: [
              { id: 'urgent', name: 'Urgent', color: '#ff3344' },
              { id: 'team', name: 'Team' },
            ],
          },
        ] as Entry[]
      }
    />
  );
}

it('keeps entry tags inside Filters and counts selections', () => {
  render(<Filters />);
  expect(
    screen.queryByRole('group', { name: 'Filter by tags' }),
  ).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Filters' }));
  const panel = screen.getByRole('dialog', { name: 'Filter entries' });
  const tags = within(panel).getByRole('group', { name: 'Filter by tags' });
  expect(tags).not.toHaveTextContent('Tags');
  fireEvent.click(
    within(tags).getByRole('button', { name: 'Filter by tag Urgent' }),
  );
  fireEvent.click(
    within(tags).getByRole('button', { name: 'Filter by tag Team' }),
  );
  expect(screen.getByLabelText('2 active filters')).toBeInTheDocument();
  expect(
    within(tags).getByRole('button', { name: 'Filter by tag Urgent' }),
  ).toHaveAttribute('aria-pressed', 'true');
  fireEvent.click(
    within(tags).getByRole('button', { name: 'Clear tag filters' }),
  );
  expect(screen.queryByLabelText('2 active filters')).not.toBeInTheDocument();
});

it('clears tag and entry-type selections together', () => {
  render(<Filters />);
  fireEvent.click(screen.getByRole('button', { name: 'Filters' }));
  fireEvent.click(screen.getByRole('button', { name: 'Task' }));
  fireEvent.click(screen.getByRole('button', { name: 'Filter by tag Urgent' }));
  expect(screen.getByLabelText('2 active filters')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Clear all filters' }));
  expect(screen.getByRole('button', { name: 'All types' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  expect(
    screen.getByRole('button', { name: 'Filter by tag Urgent' }),
  ).toHaveAttribute('aria-pressed', 'false');
  fireEvent.keyDown(window, { key: 'Escape' });
  expect(
    screen.queryByRole('group', { name: 'Filter by tags' }),
  ).not.toBeInTheDocument();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it('clamps the panel inside a narrow viewport after selections and resize', () => {
  vi.stubGlobal('innerWidth', 320);
  vi.stubGlobal('innerHeight', 800);
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue(
    new DOMRect(100, 60, 80, 40),
  );
  render(<Filters />);
  fireEvent.click(screen.getByRole('button', { name: 'Filters' }));
  const panel = screen.getByRole('dialog', { name: 'Filter entries' });
  expect(panel.style.left).toBe('12px');
  expect(panel.style.width).toBe('296px');
  fireEvent.click(screen.getByRole('button', { name: 'Filter by tag Urgent' }));
  expect(panel.style.left).toBe('12px');
  vi.stubGlobal('innerWidth', 768);
  fireEvent(window, new Event('resize'));
  expect(panel.style.width).toBe('352px');
  fireEvent.keyDown(window, { key: 'Escape' });
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: /Filters/ })).toHaveFocus();
});
