/**
 * Pure helpers for Sprint ↔ Task membership sync.
 *
 * Sprint.tasks is UI-managed; Task.sprint (REFERENCES) is the source of truth.
 * When the user edits the sprint's tasks field we patch Task.sprint add/clear
 * rather than persisting a second REFERENCES direction on the sprint.
 */

export type SprintTaskRef = { id: string; field_key?: string | null };

/** Diff next task ids against inbound Task.sprint backlinks and current sprint task ids. */
export function planSprintTaskMembershipSync(args: {
  nextTaskIds: unknown;
  referencedBy?: SprintTaskRef[] | undefined;
  currentTaskIds?: unknown;
}): { toAdd: string[]; toRemove: string[] } {
  const nextIds = new Set(
    (Array.isArray(args.nextTaskIds) ? args.nextTaskIds : [])
      .map(v => {
        if (typeof v === 'string') return v.trim();
        if (typeof v === 'object' && v !== null && 'id' in v) {
          return String((v as { id?: unknown }).id || '').trim();
        }
        return String(v || '').trim();
      })
      .filter(Boolean)
  );

  const prevIds = new Set<string>();

  // Include tasks currently tracked in custom_fields.tasks (if any)
  const currentList = Array.isArray(args.currentTaskIds)
    ? args.currentTaskIds
    : typeof args.currentTaskIds === 'string' && args.currentTaskIds.trim()
    ? [args.currentTaskIds.trim()]
    : [];
  for (const item of currentList) {
    const s =
      typeof item === 'string'
        ? item.trim()
        : typeof item === 'object' && item !== null && 'id' in item
        ? String((item as { id?: unknown }).id || '').trim()
        : String(item || '').trim();
    if (s) prevIds.add(s);
  }

  // Include inbound Task.sprint backlinks only (empty field_key is not sprint).
  for (const r of args.referencedBy || []) {
    const key = (r.field_key || '').trim().toLowerCase();
    if (key === 'sprint' && r.id) {
      prevIds.add(String(r.id).trim());
    }
  }

  return {
    toAdd: [...nextIds].filter(id => !prevIds.has(id)),
    toRemove: [...prevIds].filter(id => !nextIds.has(id)),
  };
}

/** Clear Task.sprint only when it still points at this sprint (stale-safe). */
export function shouldClearTaskSprintLink(
  currentSprintId: unknown,
  sprintEntryId: string
): boolean {
  if (currentSprintId === null || currentSprintId === undefined || currentSprintId === '') {
    return true;
  }
  const target = sprintEntryId.trim();
  if (typeof currentSprintId === 'string') {
    return currentSprintId.trim() === target;
  }
  if (Array.isArray(currentSprintId)) {
    if (currentSprintId.length === 0) return true;
    return currentSprintId.some(v => shouldClearTaskSprintLink(v, sprintEntryId));
  }
  if (typeof currentSprintId === 'object' && currentSprintId !== null) {
    const rawId = (currentSprintId as { id?: unknown }).id;
    if (rawId) return String(rawId).trim() === target;
  }
  return String(currentSprintId).trim() === target;
}
