/**
 * An App's settings screens, shown inside its settings dialog.
 *
 * An App can keep reference data and screens (rates, calendars, banks...) on a track it hides from its track list and
 * declare that track as a settings page (``ui:pages`` in its settings schema). The dialog shows the page's view here,
 * with the same record dialogs a track page offers: open a record, add a record.
 */
import { useCallback, useEffect, useState } from 'react';
import { entriesApi, entryTypesApi, tracksApi } from '../../api';
import { Text } from '../../ui';
import { EntryDetail } from '../entries/EntryDetail';
import { EntryComposeModal, type EntryComposeSeed } from '../entries/EntryComposer';
import { ComposableViewSlot } from '../views/ComposableViewSlot';
import { findRequestedEntryType, slugifyKanbanColumnKey } from '../views/kanbanColumnUtils';
import { getDisallowedCustomFieldKeys, getMissingRequiredFields } from '../../utils/entryMetaFields';
import { errorMessageFromAxios } from '../../api/helpers';
import { useToast } from '../../context/ToastContext';
import type { Entry, EntryTypeNode, OperationalModelFieldSpec, Track } from '../../types';
import type { EntryCreateInput } from '../../views/types';

export type AppSettingsPageSpec = { label: string; description?: string; track: string; view?: string };

export function AppSettingsPageHost({ appId, page }: { appId: string; page: AppSettingsPageSpec }) {
  const { showToast } = useToast();
  const [track, setTrack] = useState<Track | null>(null);
  const [entryTypes, setEntryTypes] = useState<EntryTypeNode[]>([]);
  const [failed, setFailed] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const [open, setOpen] = useState<Entry | null>(null);
  const [compose, setCompose] = useState<EntryComposeSeed | null>(null);
  const bump = useCallback(() => setRefresh(n => n + 1), []);

  useEffect(() => {
    let cancelled = false;
    setFailed(false);
    (async () => {
      try {
        const all = await tracksApi.list({ skipEntryCounts: true, include_nav_hidden: true });
        const found = (all as Track[]).find(t => t.title === page.track);
        if (!found) throw new Error('missing');
        const [full, types] = await Promise.all([tracksApi.get(found.id), entryTypesApi.list({ track_id: found.id }).catch(() => [])]);
        if (cancelled) return;
        setTrack(full);
        setEntryTypes(types as EntryTypeNode[]);
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();
    return () => { cancelled = true; };
  }, [page.track]);

  const create = useCallback(async (input: EntryCreateInput): Promise<Entry | void> => {
    if (!track) return;
    // A caller that names its type (a settings section's Add) gets exactly that type.
    const type = findRequestedEntryType(entryTypes, input.type);
    const slug = slugifyKanbanColumnKey(type?.name || input.type || '') || 'post';
    const fields = (type?.form_schema?.fields ?? []) as OperationalModelFieldSpec[];
    if (getMissingRequiredFields(fields, input.custom_fields).length || getDisallowedCustomFieldKeys(fields, input.custom_fields).length) {
      setCompose({ title: input.title, type: slug, custom_fields: input.custom_fields });
      return;
    }
    try {
      const created = await entriesApi.create({ track_id: track.id, type: slug, title: input.title, custom_fields: input.custom_fields });
      bump();
      return created;
    } catch (err) {
      showToast(errorMessageFromAxios(err, 'Failed to create entry'), 'error');
    }
  }, [track, entryTypes, bump, showToast]);

  if (failed) return <Text as="p" tone="muted">These settings are unavailable.</Text>;
  if (!track) return <Text variant="body-sm" tone="subtle" as="p">Loading settings…</Text>;
  if (!page.view) return <Text as="p" tone="muted">This settings page has no screen configured.</Text>;

  return (
    <>
      <ComposableViewSlot
        key={refresh}
        trackId={track.id}
        viewKey={page.view}
        bindings={{ appId }}
        entryTypes={entryTypes}
        onEntryOpen={entry => setOpen(entry)}
        onEntryCreate={create}
        onEntryPersist={bump}
        isEditor
      />
      {open ? (
        <EntryDetail
          key={open.id}
          entry={open}
          track={track}
          onClose={() => { setOpen(null); bump(); }}
          onUpdate={() => bump()}
          onDelete={() => { setOpen(null); bump(); }}
        />
      ) : null}
      {compose ? (
        <EntryComposeModal
          key={JSON.stringify(compose)}
          open
          track={track}
          seed={compose}
          onClose={() => setCompose(null)}
          onCreated={entry => { setCompose(null); bump(); setOpen(entry); }}
        />
      ) : null}
    </>
  );
}
