/**
 * First-login guidance registered with the shared system notification bar.
 *
 * Guidance waits behind operational notices instead of adding a second strip
 * that the fixed sidebar and assistant dock can obscure.
 */
import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

import { useFirstLoginOnboarding } from '../../hooks/useFirstLoginOnboarding';
import { useSystemNotifications } from '../system';

const NOTIFICATION_ID = 'onboarding:get-started';

export function OnboardingGetStartedBanner() {
  const { shouldOnboard, dismiss: dismissWelcome } = useFirstLoginOnboarding();
  const { notify, dismiss } = useSystemNotifications();
  const navigate = useNavigate();

  useEffect(() => {
    if (!shouldOnboard) return;
    notify({
      id: NOTIFICATION_ID,
      type: 'info',
      // Verification, connectivity, quota and update notices come first.
      priority: 10,
      title: 'Welcome to Integral',
      body: 'Learn how Apps, Tracks and Entries organize your work.',
      actions: [{ label: 'Getting started', onClick: () => navigate('/settings#get-started') }],
      onUserDismiss: dismissWelcome,
    });
    // Layout unmounts at sign-out; guidance must not remain on the login page.
    return () => dismiss(NOTIFICATION_ID);
  }, [shouldOnboard, dismissWelcome, notify, dismiss, navigate]);

  return null;
}
