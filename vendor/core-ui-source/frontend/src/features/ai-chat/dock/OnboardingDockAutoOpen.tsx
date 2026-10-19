import { useEffect, useRef } from 'react';

import { useAssistantDock } from '../../../context/AssistantDockContext';
import { useFirstLoginOnboarding } from '../../../hooks/useFirstLoginOnboarding';

/** Session flag so the dock opens once per tab, not on every route change. */
const AUTO_OPENED_KEY = 'integral:onboarding-auto-opened';

function alreadyAutoOpened(): boolean {
  try {
    return sessionStorage.getItem(AUTO_OPENED_KEY) === '1';
  } catch {
    return false;
  }
}

function markAutoOpened(): void {
  try {
    sessionStorage.setItem(AUTO_OPENED_KEY, '1');
  } catch {
    /* private mode — worst case the dock re-opens once */
  }
}

/**
 * Opens the assistant dock, seeded for onboarding, on first login.
 *
 * Replaces the full-screen takeover modal. A modal made the first thing a new
 * user sees a wall between them and the product they just signed up for; the
 * dock puts the same conversation beside the app, so they can look around
 * while it walks them through setup — and it teaches where the assistant
 * lives from minute one, which the modal actively obscured.
 *
 * Headless: `Layout` provides the dock context, so it cannot consume it.
 */
export function OnboardingDockAutoOpen() {
  const { shouldOnboard, agentiveEnabled } = useFirstLoginOnboarding();
  const { openDock, setOnboarding } = useAssistantDock();
  const fired = useRef(false);

  useEffect(() => {
    if (fired.current) return;
    if (!shouldOnboard || !agentiveEnabled) return;
    if (alreadyAutoOpened()) {
      // Still flag the surface: the user may have closed the dock and
      // reopened it, and the onboarding framing should survive that.
      setOnboarding(true);
      fired.current = true;
      return;
    }
    fired.current = true;
    markAutoOpened();
    setOnboarding(true);
    openDock({ view: 'chat' });
  }, [shouldOnboard, agentiveEnabled, openDock, setOnboarding]);

  // Clear the framing once the user finishes or skips, so a later dock open
  // is an ordinary chat rather than a stale welcome.
  useEffect(() => {
    if (!shouldOnboard && fired.current) setOnboarding(false);
  }, [shouldOnboard, setOnboarding]);

  return null;
}
