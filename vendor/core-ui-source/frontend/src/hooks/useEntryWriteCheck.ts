import { useEffect, useRef, useState } from 'react';
import apiClient from '../api/client';

/** What the server says about a record that has not been saved yet. */
export interface EntryWriteCheck {
  /** False while a check is running or once the server says the save would be refused. */
  ok: boolean;
  pending: boolean;
  /** Why the save would be refused, in the App's own words. */
  message: string;
  field?: string;
}

interface Params {
  enabled: boolean;
  trackId?: string;
  typeId?: string;
  /** Set when editing; absent when creating. */
  entryId?: string;
  title?: string;
  customFields: Record<string, unknown>;
  /** Wait this long after the last change before asking (ms). */
  delay?: number;
}

const READY: EntryWriteCheck = { ok: true, pending: false, message: '' };

/**
 * Ask the server whether this create or update would save, while the person fills the form in.
 *
 * The server runs the same field validation and App rules a real save runs (``POST /entries/check``),
 * without writing. Forms show ``message`` and keep Save/Create disabled while ``ok`` is false. The real
 * save is still checked on the server; a failed or unavailable check never blocks it by itself.
 */
export function useEntryWriteCheck({
  enabled,
  trackId,
  typeId,
  entryId,
  title,
  customFields,
  delay = 500,
}: Params): EntryWriteCheck {
  const [state, setState] = useState<EntryWriteCheck>(READY);
  const seq = useRef(0);
  const key = JSON.stringify([trackId, typeId, entryId, title, customFields]);

  useEffect(() => {
    if (!enabled || !trackId || !typeId) {
      setState(READY);
      return;
    }
    const mine = ++seq.current;
    setState(prev => ({ ...prev, pending: true }));
    const timer = window.setTimeout(() => {
      const fields: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(customFields || {})) {
        // Files are uploaded on save; the check only needs the other values.
        if (v instanceof File || (Array.isArray(v) && v.some(x => x instanceof File))) continue;
        fields[k] = v;
      }
      apiClient
        .post(
          '/entries/check',
          { track_id: trackId, type_id: typeId, entry_id: entryId || '', title: title || '', custom_fields: fields },
          { __suppressSystemNotify: true } as never,
        )
        .then(({ data }) => {
          if (mine !== seq.current) return;
          const ok = data?.ok !== false;
          setState({ ok, pending: false, message: ok ? '' : String(data?.message || ''), field: data?.field });
        })
        .catch(() => {
          // A check that could not run must not lock the form: the save itself is still checked.
          if (mine === seq.current) setState(READY);
        });
    }, delay);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, key, delay]);

  return state;
}
