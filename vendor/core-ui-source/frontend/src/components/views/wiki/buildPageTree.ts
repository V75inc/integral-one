import type { Entry } from '../../../types';
import { resolveEntryFieldValue } from '../../../utils/entryFieldValue';

export interface WikiTreeNode {
  entry: Entry;
  children: WikiTreeNode[];
}

export interface WikiPageTree {
  roots: WikiTreeNode[];
  byId: Map<string, WikiTreeNode>;
}

export interface SortSiblingsConfig {
  field?: string;
  direction?: 'asc' | 'desc';
}

/** Resolve a parent entry id from a relation-backed custom field value. */
export function resolveParentEntryId(
  entry: Entry,
  parentField: string
): string | null {
  let raw: unknown;
  if (parentField.startsWith('custom_fields.') || !parentField.includes('.')) {
    raw = resolveEntryFieldValue(entry, parentField);
  } else {
    const parts = parentField.split('.');
    let val: unknown = entry;
    for (const p of parts) {
      val = (val as Record<string, unknown>)?.[p];
      if (val === undefined) break;
    }
    raw = val;
  }

  if (raw == null || raw === '') return null;
  if (typeof raw === 'string') return raw.trim() || null;
  if (typeof raw === 'object' && !Array.isArray(raw)) {
    const id = (raw as { id?: string }).id;
    return id ? String(id).trim() : null;
  }
  if (Array.isArray(raw) && raw.length > 0) {
    const first = raw[0];
    if (typeof first === 'string') return first.trim() || null;
    if (typeof first === 'object' && first !== null) {
      const id = (first as { id?: string }).id;
      return id ? String(id).trim() : null;
    }
  }
  return null;
}

function getFieldValue(entry: Entry, field: string): string {
  let v: unknown;
  if (field.startsWith('custom_fields.') || !field.includes('.')) {
    v = resolveEntryFieldValue(entry, field);
  } else {
    const parts = field.split('.');
    v = entry;
    for (const part of parts) {
      v = (v as Record<string, unknown>)?.[part];
      if (v === undefined) break;
    }
  }
  return v == null ? '' : String(v);
}

function compareEntries(
  a: Entry,
  b: Entry,
  sort?: SortSiblingsConfig
): number {
  const field = sort?.field || 'title';
  const dir = sort?.direction === 'desc' ? -1 : 1;
  const av = getFieldValue(a, field).toLowerCase();
  const bv = getFieldValue(b, field).toLowerCase();
  if (av < bv) return -1 * dir;
  if (av > bv) return 1 * dir;
  return 0;
}

function sortNodes(nodes: WikiTreeNode[], sort?: SortSiblingsConfig): void {
  nodes.sort((a, b) => compareEntries(a.entry, b.entry, sort));
  for (const n of nodes) {
    if (n.children.length) sortNodes(n.children, sort);
  }
}

/**
 * Build a page tree from flat entries and a parent relation field.
 * Cycles are skipped (child not attached under a cyclic parent).
 */
export function buildPageTree(
  entries: Entry[],
  parentField: string,
  sortSiblings?: SortSiblingsConfig
): WikiPageTree {
  const byId = new Map<string, WikiTreeNode>();
  for (const entry of entries) {
    byId.set(entry.id, { entry, children: [] });
  }

  const roots: WikiTreeNode[] = [];

  for (const entry of entries) {
    const node = byId.get(entry.id);
    if (!node) continue;

    const parentId = resolveParentEntryId(entry, parentField);
    if (!parentId || !byId.has(parentId) || parentId === entry.id) {
      roots.push(node);
      continue;
    }

    const ancestors = new Set<string>();
    let cur: string | null = parentId;
    let cyclic = false;
    while (cur) {
      if (ancestors.has(cur)) {
        cyclic = true;
        break;
      }
      ancestors.add(cur);
      const parentEntry = entries.find(e => e.id === cur);
      cur = parentEntry ? resolveParentEntryId(parentEntry, parentField) : null;
    }

    if (cyclic) {
      roots.push(node);
      continue;
    }

    const parentNode = byId.get(parentId);
    if (parentNode) {
      parentNode.children.push(node);
    } else {
      roots.push(node);
    }
  }

  sortNodes(roots, sortSiblings);
  return { roots, byId };
}

/** Ancestor chain from root → current page (for breadcrumbs). */
export function buildBreadcrumbPath(
  entryId: string,
  entries: Entry[],
  parentField: string
): Entry[] {
  const byId = new Map(entries.map(e => [e.id, e]));
  const path: Entry[] = [];
  let cur: string | null = entryId;
  const seen = new Set<string>();

  while (cur && byId.has(cur) && !seen.has(cur)) {
    seen.add(cur);
    const entry = byId.get(cur)!;
    path.unshift(entry);
    cur = resolveParentEntryId(entry, parentField);
  }
  return path;
}

/** Flat list of entries whose titles match a case-insensitive query. */
export function filterEntriesBySearch(
  entries: Entry[],
  query: string,
  titleField: string
): Entry[] {
  const q = query.trim().toLowerCase();
  if (!q) return entries;
  return entries.filter(e => {
    const title = getEntryTitleForSearch(e, titleField);
    return title.toLowerCase().includes(q);
  });
}

function getEntryTitleForSearch(entry: Entry, titleField: string): string {
  if (titleField === 'title') return String(entry.title || '');
  if (titleField.startsWith('custom_fields.')) {
    const key = titleField.slice('custom_fields.'.length);
    const v = (entry.custom_fields as Record<string, unknown> | undefined)?.[key];
    return v == null ? '' : String(v);
  }
  return String(entry.title || '');
}
