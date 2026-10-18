import { useCallback, useEffect, useState } from 'react';
import apiClient from '../../api/client';
import { useConfirm } from '../../context/ConfirmContext';
import type { User } from '../../types';
import { isSamePrincipal } from '../../utils';
import { Text } from '../../ui';
import { Button } from '../ui';

type ResourceType = 'app' | 'track' | 'entry';
interface Source {
  source_id: string; user_id: string; resource_id: string; source: string;
  role?: string; state?: string; link_id?: string;
}
interface Snapshot {
  effective_role: string | null; links_visible: boolean; complete?: boolean;
  governance?: { source: string };
  effective_access?: Array<{ user_id: string; role: string | null }>;
  sources?: Source[];
}
interface Props {
  resourceType: ResourceType;
  resourceId: string;
  autoLoad?: boolean;
  people?: Array<Partial<Pick<User, 'id' | 'user_id' | 'display_name'>>>;
  currentUser?: Pick<User, 'id' | 'user_id' | 'display_name'> | null;
}
const roles: Record<string, string> = {
  owner: 'Owner', admin: 'Admin', editor: 'Editor', commenter: 'Commenter', viewer: 'Viewer',
};
function roleLabel(role?: string | null) { return role ? roles[role] ?? 'Custom role' : 'No access'; }
function sourceLabel(source: Source) {
  const names: Record<string, string> = {
    IS_MEMBER_OF: 'Workspace membership', OWNS: 'Ownership',
    COLLABORATES_ON: 'Added directly', share_link: 'Shared link',
    EXCLUDED_FROM: 'Inherited access excluded', ResourceAccessBlock: 'Access paused',
  };
  return names[source.source] ?? 'Access assignment';
}

export function ResourceAccessReview({ resourceType, resourceId, autoLoad = false, people = [], currentUser }: Props) {
  const confirm = useConfirm();
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    const result = await apiClient.get<Snapshot>(`/${resourceType}s/${resourceId}/access`);
    if (result.data.links_visible && result.data.complete !== true) throw new Error('Incomplete access review');
    setSnapshot(result.data);
  }, [resourceType, resourceId]);
  const run = useCallback(async (action: () => Promise<void>) => {
    setBusy(true); setError('');
    try { await action(); }
    catch { setSnapshot(null); setError('We couldn’t load or update access. Refresh and try again.'); }
    finally { setBusy(false); }
  }, []);
  useEffect(() => { if (autoLoad) void run(load); }, [autoLoad, run, load]);
  return <section aria-label="People and access" className="space-y-4">
    <div className="flex flex-wrap items-center justify-between gap-3">
      {snapshot && <Text as="p" variant="body">Your role: <strong>{roleLabel(snapshot.effective_role)}</strong></Text>}
      <Button variant="outline" size="sm" disabled={busy} onClick={() => run(load)}>{autoLoad ? 'Refresh' : 'Review access'}</Button>
    </div>
    {snapshot?.governance && <Text as="p" variant="body-sm" tone="muted">As workspace owner, you manage access here.</Text>}
    {busy && <div role="status"><Text variant="body-sm" tone="muted" as="p">Checking access…</Text></div>}
    {error && <div role="alert"><Text variant="body-sm" tone="danger" as="p">{error}</Text></div>}
    {snapshot && (snapshot.links_visible ? <>
      <Text as="p" variant="body-sm" tone="muted">See who can use this {resourceType} and how their access is assigned.</Text>
      <ul className="space-y-3">{snapshot.effective_access?.map(person => {
        const known = people.find(user => isSamePrincipal({ id: user.id ?? '', user_id: user.user_id }, person.user_id)) ??
          (currentUser && isSamePrincipal(currentUser, person.user_id) ? currentUser : undefined);
        const name = known?.display_name?.trim() || 'Member name unavailable';
        const self = !!currentUser && isSamePrincipal(currentUser, person.user_id);
        const sources = snapshot.sources?.filter(source => source.user_id === person.user_id) || [];
        const blocked = sources.some(source => source.resource_id === resourceId && source.source === 'ResourceAccessBlock' && source.state === 'blocked');
        return <li key={person.user_id} className="app-card p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Text as="p" variant="body" className="font-medium">{name}{self ? ' (you)' : ''}</Text>
            <Text as="span" variant="meta" tone="muted">{roleLabel(person.role)}</Text>
          </div>
          <ul className="space-y-2">{sources.map(source => <li key={source.source_id} className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <Text as="p" variant="body-sm">{sourceLabel(source)}{source.role ? ` · ${roleLabel(source.role)}` : ''}</Text>
              <Text as="p" variant="meta" tone="muted">{source.resource_id === resourceId ? `Assigned on this ${resourceType}` : 'Assigned through its workspace or parent'}{source.state === 'revoked' ? ' · Removed' : source.state === 'blocked' ? ' · Paused' : source.state && source.state !== 'active' ? ' · Not active' : ''}</Text>
            </div>
            {source.link_id && source.state === 'active' && <Button variant="ghost" size="sm" disabled={busy || !known} onClick={async () => {
              if (!await confirm({ title: 'Remove link access?', message: `Remove ${name}’s access from this shared link? Other ways they have access will remain.`, confirmLabel: 'Remove link access', variant: 'danger' })) return;
              void run(async () => { await apiClient.delete(`/shares/${source.link_id}/grants/${person.user_id}`); await load(); });
            }}>Remove link access</Button>}
          </li>)}</ul>
          {person.role === 'owner' ? <Text variant="meta" tone="muted" as="p">Ownership is managed in Collaborators.</Text> : !self && <div className="border-t border-[var(--panel-border)] pt-3">
            <Button variant="outline" size="sm" disabled={busy || !known} onClick={async () => {
              if (!await confirm({ title: blocked ? 'Restore access?' : 'Pause access?',
                message: blocked ? `Remove the access pause for ${name} on this ${resourceType} and everything inside it? Their existing permissions will apply again.` : `Prevent ${name} from using this ${resourceType} and everything inside it, including access from shared links or the workspace? You can restore access later.`,
                confirmLabel: blocked ? 'Restore access' : 'Pause access', variant: blocked ? 'default' : 'danger' })) return;
              void run(async () => { await apiClient.put(`/access/${resourceType}/${resourceId}/blocks`, { subject_id: person.user_id, blocked: !blocked, reason: 'Owner access review' }); await load(); });
            }}>{blocked ? 'Restore access' : 'Pause access'}</Button>
          </div>}
        </li>;
      })}</ul>
      {!snapshot.effective_access?.length && <Text as="p" variant="body-sm" tone="muted">No people to show.</Text>}
    </> : <Text as="p" variant="body-sm" tone="muted">Only an owner or admin can see how other people have access.</Text>)}
  </section>;
}
