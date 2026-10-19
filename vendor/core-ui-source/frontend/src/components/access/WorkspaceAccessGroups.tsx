import { Text } from '../../ui';
import { useState } from 'react';
import { accessControlApi, type AccessGroup, type GroupMember } from '../../api/accessControl';
import type { WorkspaceMember } from '../../api/workspaces';
import { Button } from '../ui';

export function WorkspaceAccessGroups({ workspaceId, members }: {
  workspaceId: string; members: WorkspaceMember[];
}) {
  const [groups, setGroups] = useState<AccessGroup[] | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [selected, setSelected] = useState<AccessGroup | null>(null);
  const [people, setPeople] = useState<GroupMember[]>([]);
  const [peopleCursor, setPeopleCursor] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [person, setPerson] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function run(action: () => Promise<void>) {
    setBusy(true); setError('');
    try { await action(); }
    catch { setError('The request was not confirmed. Reload current access before retrying.'); }
    finally { setBusy(false); }
  }
  async function load(next?: string) {
    const page = await accessControlApi.groups(workspaceId, next);
    setGroups(previous => next ? [...(previous || []), ...page.groups] : page.groups);
    setCursor(page.next_cursor);
  }
  async function select(group: AccessGroup, next?: string) {
    const page = await accessControlApi.groupMembers(group.id, next);
    setSelected(group); setPerson('');
    setPeople(previous => next ? [...previous, ...page.members] : page.members);
    setPeopleCursor(page.next_cursor);
  }
  return <section aria-label="Workspace access groups" className="space-y-3">
    <Button variant="secondary" disabled={busy} onClick={() => run(() => load())}>Manage access groups</Button>
    {error && <p role="alert" className="text-sm text-[var(--danger-fg)]">{error}</p>}
    {groups && <div className="space-y-3">
      <Text as="p" variant="body" tone="muted" >Groups collect current workspace members for App function roles. Membership alone grants no access to an App.</Text>
      <form className="flex flex-wrap gap-2" onSubmit={event => { event.preventDefault(); void run(async () => { await accessControlApi.createGroup(workspaceId, name); setName(''); await load(); }); }}>
        <label>Group name <input className="app-input" value={name} maxLength={120} required disabled={busy} onChange={event => setName(event.target.value)} /></label>
        <Button type="submit" disabled={busy || !name.trim()}>Create group</Button>
      </form>
      <ul className="space-y-2">{groups.map(group => <li key={group.id} className="flex gap-2 items-center">
        <Button variant="secondary" disabled={busy} onClick={() => run(() => select(group))}>{group.name}</Button>
        <Button variant="secondary" disabled={busy} onClick={() => run(async () => { await accessControlApi.deleteGroup(group.id); if (selected?.id === group.id) setSelected(null); await load(); })}>Delete {group.name}</Button>
      </li>)}</ul>
      {cursor && <Button variant="secondary" disabled={busy} onClick={() => run(() => load(cursor))}>Load more groups</Button>}
      {selected && <div role="group" aria-label={`Members of ${selected.name}`} className="app-card p-4 space-y-3">
        <p>{selected.name}</p>
        <ul>{people.map(row => <li key={row.user.id} className="flex gap-2 items-center">
          <span>{row.user.display_name || 'Unnamed user'}{!row.active ? ' · previous membership; no current grant' : ''}</span>
          <Button variant="secondary" disabled={busy} onClick={() => run(async () => { await accessControlApi.groupMember(selected.id, row.user.id, false); await select(selected); })}>Remove</Button>
        </li>)}</ul>
        {peopleCursor && <Button variant="secondary" disabled={busy} onClick={() => run(() => select(selected, peopleCursor))}>Load more members</Button>}
        <label>Workspace member <select className="app-input" value={person} disabled={busy} onChange={event => setPerson(event.target.value)}>
          <option value="">Choose a member</option>{members.map(member => <option key={member.id} value={member.id}>{member.display_name}</option>)}
        </select></label>
        <Button disabled={busy || !person} onClick={() => run(async () => { await accessControlApi.groupMember(selected.id, person, true); await select(selected); })}>Add to group</Button>
      </div>}
    </div>}
  </section>;
}
