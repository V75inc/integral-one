import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { APP_DELETED_EVENT } from '../services/graphMutationInvalidation';

/** Leave the current App only after a completed deletion, preserving the chat. */
export function useAppDeletionNavigation(appId: string | undefined) {
  const navigate = useNavigate();
  useEffect(() => {
    const deleted = (event: Event) => {
      if (appId && (event as CustomEvent<{ appId?: string }>).detail?.appId === appId) {
        navigate('/apps', { replace: true });
      }
    };
    window.addEventListener(APP_DELETED_EVENT, deleted);
    return () => window.removeEventListener(APP_DELETED_EVENT, deleted);
  }, [appId, navigate]);
}
