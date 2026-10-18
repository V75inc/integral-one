import { useEffect, useId, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { appsApi, entriesApi, entryTypesApi, tracksApi } from '../../api';
import { FormDialog } from '../../templates';
import { Input, Text, Textarea } from '../../ui';
import { AppSelect } from '../ui';
import { useAuth } from '../../context/AuthContext';
import { useScope } from '../../context/ScopeContext';
import { useToast } from '../../context/ToastContext';
import { invalidateFeedCaches } from '../../queryKeys';
import { canCreateEntryForRole, resolveTrackRoleForUser } from '../../utils/entryEditRights';
import { isTrackNavVisible } from '../../utils/trackNav';
import { entryPagePath } from '../../utils/resourcePaths';
import type { App, Entry, Track } from '../../types';

/** Publication destinations preserve the installed-App generic-query boundary. */
export function feedPostTracks(tracks: Track[], apps: App[], user: Parameters<typeof resolveTrackRoleForUser>[0]) {
  return tracks.filter(track => {
    const appId = track.app?.id;
    const app = appId ? apps.find(candidate => candidate.id === appId) : undefined;
    // Unknown parent App fails closed; paused/uninstalled/domain Apps stay closed.
    return isTrackNavVisible(track) && canCreateEntryForRole(resolveTrackRoleForUser(user, track)) &&
      (!appId || (!!app && !app.installed_package_slug && (!app.lifecycle_state || app.lifecycle_state === 'active')));
  });
}

export function PostToFeedDialog({ entry, open, onClose }: { entry: Entry; open: boolean; onClose(): void }) {
  const { user } = useAuth();
  const { scope } = useScope();
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const id = useId();
  const [trackId, setTrackId] = useState('');
  const [title, setTitle] = useState(entry.title || 'Shared entry');
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    if (open) { setTrackId(''); setTitle(entry.title || 'Shared entry'); setMessage(''); setError(''); }
  }, [open, entry.id, entry.title, scope?.workspaceId]);
  const destinations = useQuery({
    queryKey: ['feed-post-destinations', scope?.workspaceId, user?.id],
    enabled: open,
    queryFn: async () => {
      const [tracks, apps] = await Promise.all([tracksApi.list({ skipEntryCounts: true }), appsApi.list()]);
      return feedPostTracks(tracks, apps, user);
    },
  });
  const types = useQuery({
    queryKey: ['feed-post-types', scope?.workspaceId, trackId],
    enabled: open && !!trackId,
    queryFn: () => entryTypesApi.list({ track_id: trackId }),
  });
  const postType = types.data?.find(type => type.name.trim().toLowerCase() === 'post');
  const selected = destinations.data?.find(track => track.id === trackId);
  async function submit() {
    if (saving || !selected || !postType || !title.trim()) return;
    setSaving(true); setError('');
    try {
      await entriesApi.create({
        track_id: selected.id,
        type: 'post',
        type_id: postType!.id,
        title: title.trim(),
        body: `${message.trim()}${message.trim() ? '\n\n' : ''}[Open original entry](${entryPagePath(entry.id)})`,
      });
      void invalidateFeedCaches(queryClient);
      void queryClient.invalidateQueries({ queryKey: ['tracks'] });
      showToast('Posted to feed', 'success', { label: 'View feed', href: '/feed' });
      onClose();
    } catch {
      setError('The post could not be saved. Your draft is still here; try again.');
    } finally { setSaving(false); }
  }
  return (
    <FormDialog open={open} onClose={() => { if (!saving) onClose(); }} title="Post to feed" submitLabel="Post to feed" submitLoading={saving} submitDisabled={!selected || !postType || !title.trim() || saving} onSubmit={() => void submit()}>
      <Text as="p" variant="body-sm" tone="muted">Create an announcement with a link to this entry. People who can read the destination track will see the post; opening the original requires access to it.</Text>
      <div className="space-y-2">
        <Text as="label" htmlFor={`${id}-track`} variant="label">Destination track</Text>
        <AppSelect id={`${id}-track`} value={trackId} onValueChange={value => { setTrackId(value); setError(''); }} disabled={saving || destinations.isPending} placeholder={destinations.isPending ? 'Loading tracks…' : 'Choose a track'} options={(destinations.data || []).map(track => ({ value: track.id, label: track.title }))} />
        {destinations.isError ? <Text as="p" variant="body-sm" tone="danger">Tracks could not be loaded. Close and try again.</Text> : destinations.data?.length === 0 ? <Text as="p" variant="body-sm" tone="muted">You need a writable workspace track to post to the feed. Installed app tracks use their own views.</Text> : null}
        {trackId && !types.isPending && !postType && <Text as="p" variant="body-sm" tone="muted">{types.isError ? 'Entry types could not be loaded. Choose the track again.' : 'This track has no Post entry type. Choose another track.'}</Text>}
      </div>
      <div className="space-y-2">
        <Text as="label" htmlFor={`${id}-title`} variant="label">Post title</Text>
        <Input id={`${id}-title`} value={title} onChange={event => setTitle(event.target.value)} disabled={saving} required />
      </div>
      <div className="space-y-2">
        <Text as="label" htmlFor={`${id}-message`} variant="label">Message (optional)</Text>
        <Textarea id={`${id}-message`} rows={4} value={message} onChange={event => setMessage(event.target.value)} disabled={saving} placeholder="Add a little context…" />
      </div>
      <Text as="p" variant="meta">The original entry stays in its track. Its contents and attachments are not copied.</Text>
      {error && <p role="alert"><Text variant="body-sm" tone="danger">{error}</Text></p>}
    </FormDialog>
  );
}
