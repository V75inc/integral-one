import { CheckCheck } from 'lucide-react';
import { Button, LINE_ICON_STROKE, PageHeading, PageMeta, PageShell, PageSection } from '../components/ui';
import { NotificationsListBody } from '../components/notifications/NotificationsListBody';
import { useNotifications } from '../hooks/useNotifications';
import { useSetCrumbs } from '../context/CrumbsContext';
import { usePublishPageContext } from '../hooks/usePublishPageContext';

export function NotificationsPage() {
  useSetCrumbs([{ label: 'Notifications' }]);
  // Phase 9 Plan 09-02 (NOTIF-01) — migrated from useNotificationsQuery to
  // the canonical useNotifications hook (single source of unreadCount across
  // every consumer surface; one shared cache via NOTIFICATIONS_QUERY_KEY).
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

  // Counts, not contents: a notification body can quote anything a
  // collaborator wrote, and the page context rides along with every turn.
  usePublishPageContext({
    pageKind: 'notifications',
    metadata: {
      notification_count: notifications.length,
      unread_count: unreadCount,
    },
  });

  return (
    <PageShell>
      <PageSection>
        <header className="mb-8 md:mb-10 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0">
            <PageHeading>Notifications</PageHeading>
            <PageMeta>
              <span>{notifications.length} {notifications.length === 1 ? 'notification' : 'notifications'}</span>
              {unreadCount > 0 ? (
                <>
                  <span aria-hidden>·</span>
                  <span>{unreadCount} unread</span>
                </>
              ) : (
                <>
                  <span aria-hidden>·</span>
                  <span>All caught up</span>
                </>
              )}
            </PageMeta>
          </div>
          {unreadCount > 0 && (
            <Button
              className="shrink-0 self-start sm:self-end w-full sm:w-auto"
              variant="outline"
              size="sm"
              loading={isMarkingAllRead}
              icon={<CheckCheck size={14} strokeWidth={LINE_ICON_STROKE} />}
              onClick={() => void markAllRead()}
            >
              Mark all read
            </Button>
          )}
        </header>
      </PageSection>

      <PageSection.Separator />

      <PageSection className="mt-8">
        <NotificationsListBody
          notifications={notifications}
          loading={loading}
          error={error}
          onRetry={() => void refetch()}
          onMarkRead={id => void markRead(id)}
        />
      </PageSection>
    </PageShell>
  );
}
