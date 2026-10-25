import { expect, it } from 'vitest';
import { selectedTagIds, toggleTagFilter, withTagFilters, tagFilterHref } from './tagFilters';

it('preserves single-tag links and toggles several tags without losing other filters', () => {
  let params = new URLSearchParams('app=a&author=u&tag=one');
  expect(selectedTagIds(params)).toEqual(['one']);
  params = withTagFilters(params, toggleTagFilter(selectedTagIds(params), 'two'));
  expect(params.getAll('tag')).toEqual(['one', 'two']);
  expect(params.get('app')).toBe('a');
  expect(params.get('author')).toBe('u');
  params = withTagFilters(params, toggleTagFilter(selectedTagIds(params), 'one'));
  expect(params.getAll('tag')).toEqual(['two']);
  expect(withTagFilters(params, []).has('tag')).toBe(false);
  expect(selectedTagIds(new URLSearchParams('tag=one&tag=one&tag='))).toEqual(['one']);
});

it('shares toggle destinations across cards and detail links without carrying unrelated page parameters', () => {
  expect(tagFilterHref('/feed', '?app=a&tag=one&author=u', 'two')).toBe('/feed?app=a&author=u&tag=one&tag=two');
  expect(tagFilterHref('/feed', '?tag=one&tag=two', 'one')).toBe('/feed?tag=two');
  expect(tagFilterHref('/tracks/t', '?entry=e', 'one')).toBe('/feed?tag=one');
});
