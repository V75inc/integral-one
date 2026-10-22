import { useCallback, useEffect, useState } from 'react';
import { Bell, CheckCheck } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { NotificationsListBody } from '../notifications/NotificationsListBody';
// Phase 9 Plan 09-02 (NOTIF-01) — migrated to the canonical useNotifications
// hook. The bell badge unreadCount now derives from the same cache as
// NotificationsPage + MissionControlPage, so a mark_read mutation
// invalidates one query and every consumer surface recomputes consistently.
import { useNotifications } from '../../hooks/useNotifications';
import { LINE_ICON_STROKE } from '../ui';
import { ApprovalsListBody } from '../approvals/ApprovalsListBody';
import { StagedApprovalsList, useStagedApprovals } from '../approvals/StagedChatApprovals';
import {
  listApprovals,
  type ApprovalResponse,
} from '../../api/approvals';

type Tab = 'notifications' | 'approvals';

export function NotificationsHeaderButton() {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<Tab>('notifications');
  const {
    notifications,
    loading,
    error,
    refetch,
    markRead,
    markAllRead,
    unreadCount,
    isMarkingAllRead,
  } = useNotifications();

  const [approvals, setApprovals] = useState<ApprovalResponse[]>([]);
  const [approvalsLoading, setApprovalsLoading] = useState(false);
  const [approvalsError, setApprovalsError] = useState<string | null>(null);
  const stagedApprovals = useStagedApprovals();

  const refetchApprovals = useCallback(async () => {
    setApprovalsLoading(true);
    setApprovalsError(null);
    try {
      const data = await listApprovals({ status: 'pending' });
      setApprovals(data.approvals);
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : 'Failed to load approvals';
      setApprovalsError(msg);
    } finally {
      setApprovalsLoading(false);
    }
  }, []);

  // Always fetch approvals count so the bell badge stays accurate without
  // requiring the modal to open. Notifications and approvals refresh
  // together when the modal opens.
  useEffect(() => {
    void refetchApprovals();
  }, [refetchApprovals]);

  useEffect(() => {
    if (open) {
      void refetch();
      void refetchApprovals();
    }
  }, [open, refetch, refetchApprovals]);

  const approvalsCount = approvals.length + stagedApprovals.count;
  const totalCount = unreadCount + approvalsCount;
  const badge =
    totalCount > 0 ? (totalCount > 99 ? '99+' : String(totalCount)) : null;
  const ariaLabel =
    totalCount > 0
      ? `Inbox, ${unreadCount} unread ${unreadCount === 1 ? 'notification' : 'notifications'}, ${approvalsCount} ${approvalsCount === 1 ? 'approval' : 'approvals'}`
      : 'Inbox';

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="relative shrink-0 inline-flex items-center justify-center w-10 h-10 md:w-9 md:h-9 rounded-lg border border-[var(--panel-border)] bg-[var(--panel-2)] text-[var(--text)] hover:bg-[var(--panel)] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring-color)]"
        aria-label={ariaLabel}
      >
        <Bell
          size={18}
          strokeWidth={LINE_ICON_STROKE}
          className="text-[var(--text-muted)]"
        />
        {badge ? (
          <span className="absolute -top-1 -right-1 min-w-[1.125rem] h-[1.125rem] px-0.5 flex items-center justify-center rounded-full bg-[var(--brand-accent)] text-[var(--brand-accent-contrast)] text-[12px] font-bold leading-none tabular-nums">
            {badge}
          </span>
        ) : null}
      </button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Inbox"
        titleIcon={<Bell size={14} strokeWidth={LINE_ICON_STROKE} />}
      >
        <div className="p-4 sm:p-5 flex flex-col gap-4 max-h-[min(70vh,520px)]">
          <div
            role="tablist"
            aria-label="Inbox sections"
            className="inline-flex shrink-0 self-start rounded-[var(--radius-pill)] border border-[var(--panel-border)] bg-[var(--panel-2)] p-0.5 text-xs"
          >
            <TabButton
              active={tab === 'notifications'}
              onClick={() => setTab('notifications')}
              label="Notifications"
              count={unreadCount}
            />
            <TabButton
              active={tab === 'approvals'}
              onClick={() => setTab('approvals')}
              label="Approvals"
              count={approvalsCount}
            />
          </div>

          {tab === 'notifications' ? (
            <NotificationsBody
              unreadCount={unreadCount}
              isMarkingAllRead={isMarkingAllRead}
              markAllRead={markAllRead}
              notifications={notifications}
              loading={loading}
              error={error}
              refetch={refetch}
              markRead={markRead}
              onClose={() => setOpen(false)}
            />
          ) : (
            <ApprovalsBody
              rows={approvals}
              staged={stagedApprovals}
              loading={approvalsLoading}
              error={approvalsError}
              onRefetch={refetchApprovals}
              onClose={() => setOpen(false)}
            />
          )}
        </div>
      </Modal>
    </>
  );
}

function TabButton({
  active,
  onClick,
  label,
  count,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  count: number;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={[
        'rounded-[var(--radius-pill)] px-3 py-1 font-medium transition-colors duration-fast',
        active
          ? 'bg-[var(--panel)] text-[var(--text)] shadow-[var(--shadow-sm)]'
          : 'text-[var(--text-muted)] hover:text-[var(--text)]',
      ].join(' ')}
    >
      {label}
      {count > 0 ? (
        <span className="ml-1.5 inline-flex items-center justify-center rounded-full bg-[var(--brand-accent)] text-[var(--brand-accent-contrast)] text-[10px] font-bold leading-none tabular-nums min-w-[1rem] h-[1rem] px-1">
          {count > 99 ? '99+' : count}
        </span>
      ) : null}
    </button>
  );
}

function NotificationsBody({
  unreadCount,
  isMarkingAllRead,
  markAllRead,
  notifications,
  loading,
  error,
  refetch,
  markRead,
  onClose,
}: {
  unreadCount: number;
  isMarkingAllRead: boolean;
  markAllRead: () => void;
  notifications: ReturnType<typeof useNotifications>['notifications'];
  loading: boolean;
  error: ReturnType<typeof useNotifications>['error'];
  refetch: ReturnType<typeof useNotifications>['refetch'];
  markRead: ReturnType<typeof useNotifications>['markRead'];
  onClose: () => void;
}) {
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-2 shrink-0">
        {unreadCount > 0 ? (
          <p className="text-xs text-[var(--text-muted)]">
            {unreadCount} unread
          </p>
        ) : (
          <span className="text-xs text-[var(--text-muted)]">All caught up</span>
        )}
        <div className="flex flex-wrap items-center gap-2">
          {unreadCount > 0 ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              loading={isMarkingAllRead}
              icon={<CheckCheck size={14} strokeWidth={LINE_ICON_STROKE} />}
              onClick={() => markAllRead()}
            >
              Mark all read
            </Button>
          ) : null}
          <Link
            to="/notifications"
            className="text-xs font-medium text-[var(--link)] hover:text-[var(--link-hover)] hover:underline"
            onClick={onClose}
          >
            Full page
          </Link>
        </div>
      </div>
      <div className="overflow-y-auto flex-1 min-h-0 pr-0.5 -mr-0.5">
        <NotificationsListBody
          notifications={notifications}
          loading={loading}
          error={error}
          onRetry={() => void refetch()}
          onMarkRead={id => void markRead(id)}
          onNavigate={() => onClose()}
          compact
        />
      </div>
    </>
  );
}

function ApprovalsBody({
  rows,
  staged,
  loading,
  error,
  onRefetch,
  onClose,
}: {
  rows: ApprovalResponse[];
  staged: ReturnType<typeof useStagedApprovals>;
  loading: boolean;
  error: string | null;
  onRefetch: () => void;
  onClose: () => void;
}) {
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-2 shrink-0">
        {rows.length + staged.count > 0 ? (
          <p className="text-xs text-[var(--text-muted)]">
            {rows.length + staged.count} pending
          </p>
        ) : (
          <span className="text-xs text-[var(--text-muted)]">
            {loading || !staged.loaded ? 'Checking approvals…' : error || staged.refreshFailed ? 'Could not refresh approvals' : 'All clear'}
          </span>
        )}
        <Link
          to="/approvals"
          className="text-xs font-medium text-[var(--link)] hover:text-[var(--link-hover)] hover:underline"
          onClick={onClose}
        >
          Full page
        </Link>
      </div>
      <div className="overflow-y-auto flex-1 min-h-0 pr-0.5 -mr-0.5">
        <ApprovalsListBody
          rows={rows}
          loading={loading}
          error={error}
          onRetry={onRefetch}
          onDecide={onRefetch}
          hideEmptyState={staged.count > 0 || !staged.loaded || staged.refreshFailed}
          compact
        />
        <StagedApprovalsList {...staged} />
      </div>
    </>
  );
}
