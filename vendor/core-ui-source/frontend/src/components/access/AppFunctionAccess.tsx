import { Text } from '../../ui';
import { useState } from 'react';
import { accessControlApi, type AccessGroup, type ActionBinding } from '../../api/accessControl';
import { workspacesApi, type WorkspaceMember } from '../../api/workspaces';
import { Button } from '../ui';

export function AppFunctionAccess({ appId, workspaceId }: { appId: string; workspaceId: string }) {
  const [bindings, setBindings] = useState<ActionBinding[] | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [definition, setDefinition] = useState('');
  const [actions, setActions] = useState<Record<string, string[]>>({});
  const [groups, setGroups] = useState<AccessGroup[]>([]);
  const [groupCursor, setGroupCursor] = useState<string | null>(null);
  const [members, setMembers] = useState<WorkspaceMember[]>([]);
  const [kind, setKind] = useState<'human' | 'group'>('human');
  const [subject, setSubject] = useState('');
  const [role, setRole] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function run(action: () => Promise<void>) {
    setBusy(true); setError('');
    try { await action(); }
    catch { setBindings(null); setRole(''); setSubject(''); setError('Function access could not be confirmed. Reload before retrying.'); }
    finally { setBusy(false); }
  }
  async function read(next?: string) {
    const page = await accessControlApi.bindings(appId, next);
    if (next && definition !== page.definition_id) throw new Error('App definition changed');
    setBindings(previous => next ? [...(previous || []), ...page.bindings] : page.bindings);
    setCursor(page.next_cursor); setDefinition(page.definition_id); setActions(page.role_actions);
  }
  async function load() {
    const groupPage = await accessControlApi.groups(workspaceId);
    const people = await workspacesApi.listMembers(workspaceId);
    await read(); setGroups(groupPage.groups); setGroupCursor(groupPage.next_cursor); setMembers(people); setRole(''); setSubject('');
  }
  return <section aria-label="App function access" className="space-y-3">
    <Button variant="outline" size="sm" disabled={busy} onClick={() => run(load)}>{bindings ? "Refresh function roles" : "Load function roles"}</Button>
    {error && <p role="alert" className="text-sm text-[var(--danger-fg)]">{error}</p>}
    {bindings && <div className="space-y-3">
      <Text as="p" variant="body" tone="muted" >Function roles grant only the actions declared by this App. Recipients also need ordinary access to their target records. An App definition change requires fresh grants.</Text>
      {Object.keys(actions).length ? <form className="space-y-2" onSubmit={event => { event.preventDefault(); void run(async () => { await accessControlApi.bind(appId, kind, subject, role); await read(); setSubject(''); setRole(''); }); }}>
        <label className="block">Recipient kind <select className="app-input" value={kind} disabled={busy} onChange={event => { setKind(event.target.value as 'human' | 'group'); setSubject(''); }}><option value="human">Workspace member</option><option value="group">Access group</option></select></label>
        <label className="block">Recipient <select className="app-input" value={subject} disabled={busy} onChange={event => setSubject(event.target.value)}><option value="">Choose a recipient</option>{kind === 'human' ? members.map(member => <option key={member.id} value={member.id}>{member.display_name}</option>) : groups.map(group => <option key={group.id} value={group.id}>{group.name}</option>)}</select></label>
        {kind === 'group' && groupCursor && <Button variant="secondary" disabled={busy} onClick={() => run(async () => { const page = await accessControlApi.groups(workspaceId, groupCursor); setGroups(previous => [...previous, ...page.groups]); setGroupCursor(page.next_cursor); })}>Load more groups</Button>}
        <label className="block">Function role <select className="app-input" value={role} disabled={busy} onChange={event => setRole(event.target.value)}><option value="">Choose a role</option>{Object.keys(actions).map(key => <option key={key} value={key}>{key}</option>)}</select></label>
        {role && <p>Actions: {actions[role]?.join(', ')}</p>}
        <Button type="submit" disabled={busy || !subject || !role}>Grant selected function role</Button>
      </form> : <Text variant="body-sm" tone="muted" as="p">This App has no function roles to grant. Manage people and record access through Collaborators.</Text>}
      <ul className="space-y-2">{bindings.map(binding => <li key={binding.id} className="flex flex-wrap gap-2 items-center"><span>{binding.role} · {members.find(member => member.id === binding.subject_id)?.display_name || groups.find(group => group.id === binding.subject_id)?.name || binding.subject_id}{!binding.active ? ' · revoked' : binding.definition_id !== definition ? ' · previous App definition' : ''}</span>{binding.active && <Button variant="secondary" disabled={busy} onClick={() => run(async () => { await accessControlApi.revokeBinding(binding.id); await read(); })}>Revoke function role</Button>}</li>)}</ul>
      {cursor && <Button variant="secondary" disabled={busy} onClick={() => run(() => read(cursor))}>Load more function grants</Button>}
    </div>}
  </section>;
}
