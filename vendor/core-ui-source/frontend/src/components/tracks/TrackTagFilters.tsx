import type { Entry } from '../../types';
import { TagChip } from '../../ui';
import { Text } from '../../ui';

export function entriesMatchingTags(
  entries: Entry[],
  selected: string[],
): Entry[] {
  return entries.filter((entry) =>
    selected.every((id) => entry.tags?.some((tag) => tag.id === id)),
  );
}

/** Filter already permission-scoped records consistently across Track views. */
export function TrackTagFilters({
  entries,
  selected,
  onChange,
}: {
  entries: Entry[];
  selected: string[];
  onChange(value: string[]): void;
}) {
  const tags = [
    ...new Map(
      entries.flatMap((entry) => entry.tags ?? []).map((tag) => [tag.id, tag]),
    ).values(),
  ];
  if (!tags.length && !selected.length) return null;
  return (
    <div
      role="group"
      aria-label="Filter by tags"
      className="flex min-w-0 items-center gap-2 py-2"
    >
      <div
        className="flex min-w-0 flex-1 items-center gap-2 overflow-x-auto py-1"
        aria-label="Tag choices (match all)"
      >
        {tags.map((tag) => (
          <button
            key={tag.id}
            type="button"
            aria-pressed={selected.includes(tag.id)}
            aria-label={`Filter by tag ${tag.name}`}
            className="inline-flex shrink-0 items-center whitespace-nowrap rounded-[var(--radius-input)] transition-opacity hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring-color)]"
            onClick={() =>
              onChange(
                selected.includes(tag.id)
                  ? selected.filter((id) => id !== tag.id)
                  : [...selected, tag.id],
              )
            }
          >
            <TagChip
              label={tag.name}
              color={tag.color}
              selected={selected.includes(tag.id)}
            />
          </button>
        ))}
      </div>
      {!!selected.length && (
        <button
          type="button"
          aria-label="Clear tag filters"
          className="shrink-0 whitespace-nowrap rounded-[var(--radius-input)] px-2 py-1 transition-opacity hover:opacity-75 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring-color)]"
          onClick={() => onChange([])}
        >
          <Text variant="meta" tone="muted">
            Clear ({selected.length})
          </Text>
        </button>
      )}
    </div>
  );
}
