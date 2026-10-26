import { useEffect, useSyncExternalStore } from 'react';
import { getSessionConnection, subscribeSessionConnection } from '../../api/sessionConnection';
import { retryHostSession } from '../../api/session';
import { useSystemNotifications } from './SystemNotificationsContext';

export function useHostSessionNotification(): void {
  const state = useSyncExternalStore(subscribeSessionConnection, getSessionConnection);
  const { notify, dismiss } = useSystemNotifications();
  useEffect(() => {
    const id = 'system:local-session';
    if (state) notify({
      id, type: 'warning', priority: 150, dismissible: false,
      title: state === 'reconnecting' ? 'Reconnecting to your workspace' : 'Your local workspace needs attention',
      body: 'Your open work is still here. Retry, or restart the desktop app if it cannot reconnect.',
      actions: [{ label: 'Retry', onClick: async () => { await retryHostSession(); } }],
    });
    else dismiss(id);
    return () => { dismiss(id); };
  }, [state, notify, dismiss]);
}
