import { Text } from '../../ui';
import { useState } from 'react';
import { ownershipConsentApi, type OwnershipProposal } from '../../api/accessControl';
import type { WorkspaceMember } from '../../api/workspaces';
import { Button } from '../ui';

export function WorkspaceOwnershipConsent({ workspaceId, members }: {
  workspaceId: string; members: WorkspaceMember[];
}) {
  const [recipient, setRecipient] = useState('');
  const [proposals, setProposals] = useState<OwnershipProposal[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  async function load() {
    const result = await ownershipConsentApi.workspace(workspaceId);
    if (!result.complete) throw new Error('Incomplete ownership review');
    setProposals(result.proposals);
  }
  async function run(action: () => Promise<void>) {
    setBusy(true); setMessage('');
    try { await action(); }
    catch { setProposals(null); setMessage('The request was not confirmed. Reload before retrying.'); }
    finally { setBusy(false); }
  }
  return <section aria-label="Workspace ownership" className="space-y-3">
    <Button variant="secondary" disabled={busy} onClick={() => run(load)}>Review workspace ownership</Button>
    {message && <div role="status"><Text as="p" variant="body" tone="muted" >{message}</Text></div>}
    {proposals && <>
      <Text as="p" variant="body" tone="muted" >The recipient must accept before ownership changes. Only a current member with a verified account can accept. Personal workspaces cannot be transferred.</Text>
      <form className="flex flex-wrap gap-2" onSubmit={event => {
        event.preventDefault(); void run(async () => {
          await ownershipConsentApi.propose(workspaceId, recipient);
          setRecipient(''); await load(); setMessage('Proposal sent. Ownership remains yours until the recipient accepts.');
        });
      }}>
        <label>New owner <select className="app-input" value={recipient} disabled={busy} required onChange={event => setRecipient(event.target.value)}>
          <option value="">Select a current member</option>
          {members.filter(member => member.role !== 'owner').map(member => <option key={member.user_id || member.id} value={member.user_id || member.id}>{member.display_name || 'Unnamed user'}</option>)}
        </select></label>
        <Button type="submit" disabled={busy || !recipient}>Request ownership transfer</Button>
      </form>
      <ul className="space-y-2">{proposals.filter(proposal => proposal.resource_type === 'workspace').map(proposal => <li key={proposal.proposal_id}>
        {proposal.recipient_id} · {proposal.status}{proposal.expired ? ' · expired' : ''}{proposal.status === 'pending' && !proposal.ownership_current ? ' · owner changed' : ''}
      </li>)}</ul>
    </>}
  </section>;
}
