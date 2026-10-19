import { RefreshCw } from 'lucide-react';
import { Surface, Text } from '../../ui';
import { Link } from 'react-router-dom';
import { useState } from 'react';
import { ownershipConsentApi, type OwnershipProposal } from '../../api/accessControl';
import { Button } from '../ui';
import { ownershipRowsForStatus, useOwnershipProposals, type OwnershipStatusFilter } from './useOwnershipProposals';

export function OwnershipConsentInbox({
  onAccepted, status = 'pending',
}: { onAccepted?: () => Promise<void>; status?: OwnershipStatusFilter } = {}) {
  const inbox = useOwnershipProposals();
  const proposals = ownershipRowsForStatus(inbox.data ?? [], status);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [decisionUnconfirmed, setDecisionUnconfirmed] = useState(false);
  async function load() {
    setMessage('');
    const result = await inbox.refetch();
    if (!result.isError) setDecisionUnconfirmed(false);
  }
  async function respond(proposal: OwnershipProposal, action: 'accept' | 'decline') {
    setBusy(true); setMessage('');
    try {
      await ownershipConsentApi.respond(proposal, action);
      if (action === 'accept') await onAccepted?.();
      const result = await inbox.refetch();
      if (result.isError) throw result.error;
      setMessage(action === 'accept' ? 'Ownership accepted.' : 'Proposal declined.');
    } catch {
      setDecisionUnconfirmed(true);
      setMessage('The decision was not confirmed. Reload before retrying.');
    } finally { setBusy(false); }
  }
  if (!inbox.isPending && !inbox.isError && proposals.length === 0 && !message) return null;
  return <section aria-label="Ownership proposals" className="mt-8">
    <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
      <Text as="h2" variant="body-sm" tone="muted" weight="medium">Ownership proposals</Text>
      <Button variant="secondary" size="sm" icon={<RefreshCw size={14} aria-hidden />} loading={inbox.isFetching} disabled={busy} onClick={() => void load()}>Refresh</Button>
    </div>
    {inbox.isPending && <Text as="p" variant="body-sm" tone="muted">Checking ownership proposals…</Text>}
    {inbox.isError && <div role="status"><Text as="p" variant="body-sm" tone="warn">Ownership proposals could not be loaded. Refresh before making a decision.</Text></div>}
    {message && <div role="status"><Text as="p" variant="body-sm" tone="muted">{message}</Text></div>}
    {!inbox.isError && <ul className="space-y-2">{proposals.map(proposal => {
      const pending = proposal.status === 'pending' && !proposal.expired;
      const resourceKind = proposal.resource_type[0].toUpperCase() + proposal.resource_type.slice(1);
      const href = `/${{ workspace: 'workspaces', app: 'apps', track: 'tracks' }[proposal.resource_type]}/${encodeURIComponent(proposal.resource_id)}`;
      return <Surface as="li" key={proposal.proposal_id} tone="panel" border="default" radius="input" style={pending ? { backgroundColor: 'var(--nav-active-bg)' } : undefined} className="flex items-start gap-4 p-4">
        <span aria-hidden className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: pending ? 'var(--warn-fg)' : proposal.status === 'accepted' ? 'var(--success-fg)' : 'var(--text-subtle)' }} />
        <div className="min-w-0 flex-1 space-y-2">
          <Text as="p" variant="body" weight="medium" className="[overflow-wrap:anywhere]">Ownership transfer for {resourceKind}</Text>
          <Text as="p" variant="body-sm" tone="muted">Accepting makes you responsible for this resource. Expires <time dateTime={proposal.expires_at}>{new Date(proposal.expires_at).toLocaleString()}</time>.</Text>
          <Link to={href} className="inline-block hover:underline"><Text variant="meta" tone="muted">Review affected record</Text></Link>
          {pending && proposal.ownership_current ? <div className="flex flex-wrap gap-2">
            <Button disabled={busy || decisionUnconfirmed || inbox.isFetching} onClick={() => respond(proposal, 'accept')}>Accept ownership</Button>
            <Button variant="secondary" disabled={busy || decisionUnconfirmed || inbox.isFetching} onClick={() => respond(proposal, 'decline')}>Decline</Button>
          </div> : <Text as="p" variant="body-sm" tone="muted">{proposal.status}{proposal.expired && proposal.status === 'pending' ? ' · expired' : ''}{proposal.status === 'pending' && !proposal.ownership_current ? ' · owner changed; request a new proposal' : ''}</Text>}
        </div>
      </Surface>;
    })}</ul>}
  </section>;
}
