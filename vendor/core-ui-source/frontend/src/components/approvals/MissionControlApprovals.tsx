import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { listApprovals } from '../../api/approvals';
import { listPendingStagedChanges } from '../../api/agentive';
import { ownershipRowsForStatus, useOwnershipProposals } from '../access/useOwnershipProposals';
import { Text } from '../../ui';

/** Compact cross-workspace inbox preview; decisions stay on the Approvals page. */
export function MissionControlApprovals() {
  const policy = useQuery({
    queryKey: ['mission-control', 'pending-policy-approvals'],
    queryFn: () => listApprovals({ status: 'pending' }),
  });
  const staged = useQuery({
    queryKey: ['mission-control', 'pending-staged-approvals'],
    queryFn: listPendingStagedChanges,
  });
  const ownership = useOwnershipProposals();
  const ownershipCount = ownershipRowsForStatus(ownership.data ?? [], 'pending').length;
  const policyCount = policy.data?.approvals.length ?? 0;
  const stagedCount = (staged.data ?? []).filter(
    row => row.state === 'pending' && row.kind !== 'design_proposal',
  ).length;
  const count = policyCount + stagedCount + ownershipCount;

  const failed = policy.isError || staged.isError || ownership.isError;
  const loading = policy.isPending || staged.isPending || ownership.isPending;
  const retry = () => { void Promise.all([policy.refetch(), staged.refetch(), ownership.refetch()]); };
  return <div className="mb-2">
    <Link to="/approvals" className="flex min-h-11 items-center justify-between gap-3 py-2 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2">
      <Text variant="body-sm">{failed ? 'Approval inbox unavailable' : loading ? 'Checking for pending approvals…' : count ? `${count} pending ${count === 1 ? 'item' : 'items'} across policy, agent chat and ownership.` : 'No pending approvals.'}</Text>
      <Text variant="body-sm" aria-hidden>→</Text>
    </Link>
    {failed && <button type="button" onClick={retry} className="min-h-11 hover:underline focus-visible:outline focus-visible:outline-2"><Text variant="body-sm">Retry approvals</Text></button>}
  </div>;
}
