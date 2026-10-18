import type { Entry } from '../../types';
import { Pill } from '../ui';
import { Text } from '../../ui';
import { tagColorStyle } from '../../utils/tagColor';

export function entriesMatchingTags(entries: Entry[], selected: string[]): Entry[] {
  return entries.filter(entry => selected.every(id => entry.tags?.some(tag => tag.id === id)));
}

/** Filter already permission-scoped records consistently across Track views. */
export function TrackTagFilters({ entries, selected, onChange }: {
  entries: Entry[]; selected: string[]; onChange(value: string[]): void;
}) {
  const tags = [...new Map(entries.flatMap(entry => entry.tags ?? []).map(tag => [tag.id, tag])).values()];
  if (!tags.length && !selected.length) return null;
  return <div role="group" aria-label="Filter by tags" className="flex flex-wrap items-center gap-2 px-4 py-2">
    <Text variant="meta" tone="muted">Tags (match all):</Text>
    {tags.map(tag => <button key={tag.id} type="button" aria-pressed={selected.includes(tag.id)}
      aria-label={`Filter by tag ${tag.name}`} className="rounded-full focus-visible:ring-2 focus-visible:ring-[var(--focus-ring-color)]"
      onClick={() => onChange(selected.includes(tag.id) ? selected.filter(id => id !== tag.id) : [...selected, tag.id])}>
      <Pill tone="descriptive" style={tagColorStyle(tag.color)} className={selected.includes(tag.id) ? 'ring-2 ring-[var(--text)]' : ''}>#{tag.name}</Pill>
    </button>)}
    {!!selected.length && <button type="button" className="text-xs text-[var(--link)]" onClick={() => onChange([])}>Clear tag filters</button>}
  </div>;
}
