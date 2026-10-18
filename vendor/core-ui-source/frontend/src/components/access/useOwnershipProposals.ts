import { useDeployment } from '../../hooks/useDeployment';
import { useQuery } from '@tanstack/react-query';
import { ownershipConsentApi, type OwnershipProposal } from '../../api/accessControl';

export type OwnershipStatusFilter = 'pending' | 'approved' | 'rejected' | 'expired';
export const ownershipInboxQueryKey = ['ownership-proposals', 'inbox'] as const;

export function ownershipRowsForStatus(rows: OwnershipProposal[], status: OwnershipStatusFilter) {
  if (status === 'expired') return rows.filter(row => (row.status === 'pending' && row.expired) || row.status === 'expired');
  const expected = { pending: 'pending', approved: 'accepted', rejected: 'declined' }[status];
  return rows.filter(row => row.status === expected && (status !== 'pending' || !row.expired));
}

export function useOwnershipProposals() {
  const { collaboration } = useDeployment();
  return useQuery({
    queryKey: [...ownershipInboxQueryKey, collaboration],
    queryFn: async () => {
      if (!collaboration) return [];
      const result = await ownershipConsentApi.inbox();
      if (!result.complete) throw new Error('Ownership proposals could not be loaded completely.');
      return result.proposals;
    },
  });
}
