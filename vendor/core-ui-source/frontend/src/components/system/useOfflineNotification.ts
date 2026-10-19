/**
 * useOfflineNotification — pushes a persistent "You're offline" system bar
 * while navigator.onLine === false. Dismisses automatically on reconnection.
 *
 * Mount once at app root (e.g. in App.tsx) inside the SystemNotificationsProvider.
 */

import { useEffect, useRef } from 'react';
import { useSystemNotifications } from './SystemNotificationsContext';

const NOTIF_ID = 'system:offline';

export function useOfflineNotification() {
  const { notify, dismiss } = useSystemNotifications();
  const lastStateRef = useRef<boolean | null>(null);

  useEffect(() => {
    const handle = () => {
      const online = navigator.onLine;
      if (lastStateRef.current === online) return;
      lastStateRef.current = online;
      if (!online) {
        notify({
          id: NOTIF_ID,
          type: 'error',
          title: "You're offline",
          body: 'Changes will sync once your connection is restored.',
          dismissible: false,
          priority: 200, // above all other types
        });
      } else {
        dismiss(NOTIF_ID);
      }
    };
    // Initialize with current state
    handle();
    window.addEventListener('online', handle);
    window.addEventListener('offline', handle);
    return () => {
      window.removeEventListener('online', handle);
      window.removeEventListener('offline', handle);
    };
  }, [notify, dismiss]);
}
