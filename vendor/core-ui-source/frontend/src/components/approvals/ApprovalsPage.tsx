import { useCallback, useEffect, useRef, useState } from 'react';
import { PageHeading, PageMeta, PageShell, PageSection } from '../ui';
import { useQueryClient } from '@tanstack/react-query';
import { OwnershipConsentInbox } from '../access/OwnershipConsentInbox';
import { ownershipRowsForStatus, useOwnershipProposals } from '../access/useOwnershipProposals';
import { Select, Text } from '../../ui';
import { useSetCrumbs } from '../../context/CrumbsContext';
import {
  listApprovals,
  type ApprovalResponse,
} from '../../api/approvals';
import { ApprovalsListBody } from './ApprovalsListBody';
import { StagedApprovalsList, useStagedApprovals } from './StagedChatApprovals';

type StatusFilter = 'pending' | 'approved' | 'rejected' | 'expired';

export function ApprovalsPage() {
  useSetCrumbs([{ label: 'Approvals' }]);

  const [rows, setRows] = useState<ApprovalResponse[]>([]);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('pending');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const ownership = useOwnershipProposals();
  const ownershipCount = ownershipRowsForStatus(ownership.data ?? [], statusFilter).length;
  const staged = useStagedApprovals();
  const stagedCount = staged.count;
  const [loadedStatus, setLoadedStatus] = useState<StatusFilter | null>(null);
  const requestRevision = useRef(0);

  const refetch = useCallback(async () => {
    const revision = ++requestRevision.current;
    setLoading(true);
    setError(null);
    try {
      const data = await listApprovals({ status: statusFilter });
      if (revision !== requestRevision.current) return;
      setRows(data.approvals);
      setLoadedStatus(statusFilter);
    } catch (err) {
      if (revision !== requestRevision.current) return;
      const msg =
        err instanceof Error ? err.message : 'Failed to load approvals';
      setError(msg);
    } finally {
      if (revision === requestRevision.current) setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  const pendingCount = rows.filter(r => r.status === 'pending').length;
  // Staged chat changes have no status axis — they are pending or they are
  // gone — so they only belong under the pending filter.
  const showStaged = statusFilter === 'pending';

  return (
    <PageShell>
      <PageSection>
        <header className="mb-8 md:mb-10 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0">
            <PageHeading>Approvals</PageHeading>
            <PageMeta>
              <span>
                {rows.length + ownershipCount + (statusFilter === 'pending' ? stagedCount : 0)}{' '}
                {rows.length + ownershipCount +
                  (statusFilter === 'pending' ? stagedCount : 0) ===
                1
                  ? 'item'
                  : 'items'}
              </span>
              <span aria-hidden>·</span>
              <span>
                {statusFilter === 'pending' &&
                pendingCount === 0 &&
                stagedCount === 0 && ownershipCount === 0
                  ? loading || !staged.loaded || ownership.isPending
                    ? 'Checking approvals…'
                    : error || staged.refreshFailed || ownership.isError
                      ? 'Could not refresh approvals'
                      : loadedStatus !== statusFilter
                        ? 'Checking approvals…'
                        : 'All clear'
                  : `Showing ${statusFilter}`}
              </span>
            </PageMeta>
          </div>
          <label className="flex items-center gap-2 text-sm shrink-0">
            <span className="text-[var(--text-muted)]">Status</span>
            <Select
              size="sm"
              value={statusFilter}
              onChange={e =>
                setStatusFilter(e.target.value as StatusFilter)
              }
            >
              <option value="pending">Pending</option>
              <option value="approved">Approved</option>
              <option value="rejected">Rejected</option>
              <option value="expired">Expired</option>
            </Select>
          </label>
        </header>
      </PageSection>

      <PageSection.Separator />

      <PageSection className="mt-8">
        {/* One review area for policy, proposed changes and ownership.
            Decisions stay explicit within each independently loaded queue. */}
        {rows.length > 0 ? (
          <Text
            variant="body-sm"
            weight="medium"
            tone="muted"
            as="h2"
            className="mb-3 block"
          >
            Policy approvals
          </Text>
        ) : null}
        <ApprovalsListBody
          rows={rows}
          loading={loading}
          error={error}
          onRetry={() => void refetch()}
          onDecide={() => void refetch()}
          // Its empty state is worded for the whole page; let it speak only
          // when there is genuinely nothing pending anywhere.
          hideEmptyState={ownershipCount > 0 || ownership.isPending || ownership.isError || (showStaged && (stagedCount > 0 || !staged.loaded || staged.refreshFailed))}
        />
        {showStaged && <StagedApprovalsList {...staged} />}
        <OwnershipConsentInbox status={statusFilter} onAccepted={async () => { await queryClient.invalidateQueries(); }} />
      </PageSection>
    </PageShell>
  );
}
