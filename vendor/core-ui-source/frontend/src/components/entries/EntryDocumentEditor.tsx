import { Suspense, lazy, useCallback, useEffect, useRef, useState } from 'react';

import { entriesApi } from '../../api';
import type { Entry } from '../../types';
import { Text } from '../../ui';

const DocumentEditor = lazy(() =>
  import('./document-editor/DocumentEditor').then(m => ({
    default: m.DocumentEditor,
  }))
);

const SAVE_DELAY_MS = 900;

type SaveState = 'saved' | 'dirty' | 'saving' | 'error';

/**
 * Edit an entry's body in place, as a document.
 *
 * A rich-text (markdown) editor bound to the entry body, saved a moment after
 * you stop typing. Changes made elsewhere (the assistant's staged edit once
 * approved, another tab) flow in through ``entry.body`` and replace the text,
 * unless you have unsaved typing, which always wins until it is saved.
 */
export function EntryDocumentEditor({
  entry,
  canEdit,
  onSaved,
}: {
  entry: Entry;
  canEdit: boolean;
  onSaved(entry: Entry): void;
}) {
  const [draft, setDraft] = useState(entry.body || '');
  const [state, setState] = useState<SaveState>('saved');
  const dirtyRef = useRef(false);
  const draftRef = useRef(draft);
  const timerRef = useRef<number | null>(null);
  const savingRef = useRef(false);
  const entryIdRef = useRef(entry.id);
  entryIdRef.current = entry.id;

  // Take in outside changes, but never over unsaved typing.
  useEffect(() => {
    if (dirtyRef.current || savingRef.current) return;
    const next = entry.body || '';
    if (next !== draftRef.current) {
      draftRef.current = next;
      setDraft(next);
    }
  }, [entry.body]);

  const save = useCallback(async () => {
    if (savingRef.current || !dirtyRef.current) return;
    savingRef.current = true;
    const sending = draftRef.current;
    setState('saving');
    try {
      const updated = await entriesApi.update(entryIdRef.current, { body: sending });
      // More typing during the request keeps the entry dirty for the next save.
      if (draftRef.current === sending) {
        dirtyRef.current = false;
        setState('saved');
      } else {
        setState('dirty');
      }
      onSaved(updated);
    } catch {
      setState('error');
    } finally {
      savingRef.current = false;
      if (dirtyRef.current && draftRef.current !== sending) {
        timerRef.current = window.setTimeout(() => void save(), SAVE_DELAY_MS);
      }
    }
  }, [onSaved]);

  const onChange = useCallback(
    (markdown: string) => {
      if (markdown === draftRef.current) return;
      draftRef.current = markdown;
      dirtyRef.current = true;
      setDraft(markdown);
      setState('dirty');
      if (timerRef.current) window.clearTimeout(timerRef.current);
      timerRef.current = window.setTimeout(() => void save(), SAVE_DELAY_MS);
    },
    [save]
  );

  // Do not lose the last keystrokes when leaving the page.
  useEffect(
    () => () => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
      if (dirtyRef.current) {
        void entriesApi
          .update(entryIdRef.current, { body: draftRef.current })
          .catch(() => undefined);
      }
    },
    []
  );

  const label =
    state === 'saving'
      ? 'Saving…'
      : state === 'dirty'
        ? 'Unsaved changes'
        : state === 'error'
          ? 'Could not save. Keep typing to retry.'
          : 'Saved';

  return (
    <div data-testid="entry-document-editor" className="flex h-full min-h-0 flex-col">
      <div className="min-h-0 flex-1 overflow-hidden">
        {canEdit ? (
          <Suspense
            fallback={<Text as="div" variant="body" tone="muted" className="p-4">Loading editor…</Text>}
          >
            <DocumentEditor
              value={draft}
              onChange={onChange}
              placeholder="Start writing your document…"
              aria-label="Document content"
            />
          </Suspense>
        ) : (
          <Text as="div" variant="body" className="whitespace-pre-wrap p-3">{draft}</Text>
        )}
      </div>
      {canEdit ? (
        <div
          data-testid="entry-document-save-state"
          className="border-t border-[var(--panel-border)] px-3 py-1.5"
        >
          <Text as="span" variant="body-sm" tone={state === 'error' ? 'danger' : 'muted'}>{label}</Text>
        </div>
      ) : null}
    </div>
  );
}
