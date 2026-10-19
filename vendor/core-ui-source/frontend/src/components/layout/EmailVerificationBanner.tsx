import { useDeployment } from '../../hooks/useDeployment';
/**
 * EmailVerificationBanner — pushes a system notification when the
 * authenticated user has not verified their email yet.
 *
 * The notice explains that verification is non-blocking. A user can defer it
 * for this browser session; the server's ``email_verified`` flag remains
 * authoritative.
 *
 * All visual presentation is owned by <SystemNotificationBar>; this file
 * only models when to push and when to clear.
 */

import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { MailCheck } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { authApi } from '../../api';
import { useSystemNotifications } from '../system';

const NOTIF_ID = 'auth:email-verification';
const dismissedKey = (userId: string) => `${NOTIF_ID}:dismissed:${userId}`;

function wasDeferred(userId: string): boolean {
  try {
    return sessionStorage.getItem(dismissedKey(userId)) === '1';
  } catch {
    return false;
  }
}

export function EmailVerificationBanner() {
  const { singleUser } = useDeployment();
  const { user } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const { notify, dismiss, update } = useSystemNotifications();
  const resendingRef = useRef(false);
  const mountedRef = useRef(true);

  useEffect(() => () => { mountedRef.current = false; }, []);

  // Show whenever the user is authenticated AND not yet verified. A missing
  // ``email_verified`` field (e.g. cached pre-feature user) is treated as
  // unverified so the nudge appears — getting it wrong by under-showing
  // would hide the only path back to verification.
  const shouldShow = !singleUser && !!user && user.email_verified !== true && !wasDeferred(user.id);

  useEffect(() => {
    if (!shouldShow) {
      dismiss(NOTIF_ID);
      return;
    }
    // Clear on unmount too — Layout unmounts on logout, which would
    // otherwise leave the pushed notification stuck on the public
    // /login surface.
    const cleanup = () => dismiss(NOTIF_ID);
    const handleLater = () => {
      if (user) {
        try { sessionStorage.setItem(dismissedKey(user.id), '1'); } catch { /* session storage may be disabled */ }
      }
      dismiss(NOTIF_ID);
    };
    const handleResend = async () => {
      if (resendingRef.current) return;
      resendingRef.current = true;
      // Reflect busy state in the bar without re-pushing (preserves animation).
      update(NOTIF_ID, {
        actions: [
          { label: 'Enter code', onClick: () => navigate('/verify-email') },
          { label: 'Resend code', onClick: handleResend, busy: true },
        ],
      });
      try {
        await authApi.resendVerification();
        showToast('Verification code sent — check your inbox', 'success');
        navigate('/verify-email');
      } catch {
        showToast('Could not send code. Try again shortly.', 'error');
      } finally {
        resendingRef.current = false;
        if (mountedRef.current) {
          update(NOTIF_ID, {
            actions: [
              { label: 'Enter code', onClick: () => navigate('/verify-email') },
              { label: 'Resend code', onClick: handleResend, busy: false },
            ],
          });
        }
      }
    };
    notify({
      id: NOTIF_ID,
      type: 'info',
      icon: MailCheck,
      title: 'Verify your email',
      body: 'Keep working while you verify.',
      actions: [
        { label: 'Enter code', onClick: () => navigate('/verify-email') },
        { label: 'Resend code', onClick: handleResend },
      ],
      dismissible: true,
      onUserDismiss: handleLater,
    });
    return cleanup;
  }, [shouldShow, user, notify, dismiss, update, navigate, showToast]);

  return null;
}
