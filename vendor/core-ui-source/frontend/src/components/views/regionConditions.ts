/** Shared conditional-visibility primitive for the region system — one
 *  small utility, used consistently by every widget that can hide part of
 *  itself based on another field's current value (regions in
 *  LayoutContainerWidget, fields in FormRegionWidget, columns in
 *  EditableTableWidget). Deliberately just an equality check for now
 *  (the only case asked for so far); extend the shape here, not per-widget,
 *  if a widget needs something richer (in/not-equals/etc) later.
 */
export type VisibleIf = {
  field: string;
  equals: unknown;
};

/** true when `cond` is absent (always visible — the default, backward-
 *  compatible with every config written before visible_if existed) or when
 *  `values[cond.field] === cond.equals`. */
export function isVisible(cond: VisibleIf | undefined, values: Record<string, unknown> | undefined): boolean {
  if (!cond) return true;
  return values?.[cond.field] === cond.equals;
}

/** A field/column entry in a widget's config list — either a bare key
 *  (always visible, the original shape every existing config already
 *  uses) or `{key, visible_if?, editable_in_detail?}` for conditional
 *  visibility / detail-mode edit exceptions. Shared by FormRegionWidget's
 *  `fields` and EditableTableWidget's `columns`. */
export type ConditionalFieldEntry =
  | string
  | { key: string; visible_if?: VisibleIf; editable_in_detail?: boolean };

export function fieldEntryKey(entry: ConditionalFieldEntry): string {
  return typeof entry === 'string' ? entry : entry.key;
}

export function fieldEntryVisibleIf(entry: ConditionalFieldEntry): VisibleIf | undefined {
  return typeof entry === 'string' ? undefined : entry.visible_if;
}

/** True when the field may be edited while EntryDetail is in view
 *  (mode=detail) — e.g. invoice Status without opening full edit. */
export function fieldEntryEditableInDetail(entry: ConditionalFieldEntry): boolean {
  return typeof entry === 'object' && entry.editable_in_detail === true;
}

// ── Cross-region live values ────────────────────────────────────────────
// Sibling regions in one LayoutContainerWidget (e.g. NIS's "Schedule
// Header" and "Pay Period Dates") are each rendered by their OWN
// FormRegionWidget instance, and each instance independently fetches +
// holds its own local copy of the host entry — so a field committed in one
// region (e.g. schedule_type) never reached a visible_if check evaluated
// in a SIBLING region's widget instance; only a full page reload, which
// re-fetches every instance fresh, picked it up. This context is the fix:
// LayoutContainerWidget provides one shared, live "latest committed
// values" object; every region (via FormRegionWidget) reads from it when
// evaluating its own visible_if, and writes into it the moment ITS OWN
// field commits — so a sibling region's gated field/region appears or
// disappears immediately, no reload. Optional by design: FormRegionWidget
// is also used standalone (not nested in a container), where this context
// is simply absent and every widget falls back to its own local entry
// state exactly as before.
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';

type LiveValuesContextShape = {
  values: Record<string, unknown>;
  commit: (key: string, value: unknown) => void;
};

const LiveValuesContext = createContext<LiveValuesContextShape | null>(null);

/** Provided once per LayoutContainerWidget, seeded from the host entry's
 *  own custom_fields. `commit` merges a new field value in immediately —
 *  call it from every place a field write already updates local state
 *  (FormRegionWidget's own commitField), not instead of it. */
export function useLiveValuesProvider(initial: Record<string, unknown> | undefined) {
  const [values, setValues] = useState<Record<string, unknown>>(() => ({ ...(initial || {}) }));
  const initialRef = useRef(initial);
  const committedRef = useRef<Set<string>>(new Set());
  // Re-seed when the host draft/entry snapshot identity changes (compose
  // often mounts against ``{}`` then receives defaults / entryValues).
  // Committed keys keep their value; every other key takes the newer seed,
  // so a blank from the first snapshot cannot hide a later default.
  useEffect(() => {
    if (!initial || initial === initialRef.current) return;
    initialRef.current = initial;
    setValues(prev => {
      const next = { ...prev, ...initial };
      committedRef.current.forEach(key => {
        if (key in prev) next[key] = prev[key];
      });
      return next;
    });
  }, [initial]);
  const commit = useCallback((key: string, value: unknown) => {
    committedRef.current.add(key);
    setValues(prev => ({ ...prev, [key]: value }));
  }, []);
  return { values, commit };
}

export { LiveValuesContext };

/** Reads the shared live-values channel, if this widget happens to be
 *  rendered inside a LayoutContainerWidget's regions. Returns null when
 *  standalone — callers fall back to their own local entry state. */
export function useLiveValues(): LiveValuesContextShape | null {
  return useContext(LiveValuesContext);
}
