import type { Tag } from '../types';

export function slugTagProfileKey(value: string): string {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

/** Empty / missing ``applies_to_entry_types`` means all entry types (manifest / seed default). */
export function tagAllowedForEntryType(tag: Tag, entryTypeSlug: string): boolean {
  const apply = tag.applies_to_entry_types;
  if (!apply?.length) return true;
  const want = slugTagProfileKey(entryTypeSlug);
  return apply.some(a => slugTagProfileKey(String(a)) === want);
}

export function tagsForEntryTypeAndProfile(
  tags: Tag[],
  entryTypeSlug: string
): Tag[] {
  return tags.filter(t => tagAllowedForEntryType(t, entryTypeSlug));
}

/** Order by operational model group key, then name. Tags without ``group_key`` sort last. */
export function sortTagsByProfileTaxonomy(tags: Tag[]): Tag[] {
  const groupSort = (g?: string) => (g?.trim() ? g.trim() : '\uffff');
  return [...tags].sort((a, b) => {
    const ga = groupSort(a.group_key);
    const gb = groupSort(b.group_key);
    if (ga !== gb) return ga.localeCompare(gb);
    return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
  });
}

export function formatTagGroupLabel(groupKey: string): string {
  const s = groupKey.trim();
  if (!s) return '';
  return s.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}
