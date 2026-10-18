/**
 * Phase 9 Plan 09-05 (ONBD-01) — first-login onboarding mount decision.
 *
 * Reads the authenticated User's `onboarded_at`. When `null/undefined`
 * AND the user hasn't dismissed the modal this session, returns
 * `shouldOnboard: true`. The agentive capability probe gates which
 * surface Layout mounts:
 *
 *   - A2 (`agentiveEnabled === true`)  → ``<OnboardingModal />`` hosting
 *     the agentive ChatThread seeded with the `integral_onboard_user`
 *     prompt.
 *   - A5 (`agentiveEnabled === false`) → ``<OnboardingGetStartedBanner />``
 *     pointing the user at Settings → Get started. No broken UI.
 *
 * The dismiss flag is persisted in **localStorage** so an explicit Skip
 * sticks across tabs and sessions on this device even when `onboarded_at`
 * is still null (e.g. an established account that predates onboarding, or a
 * user who declined). Without this, the modal re-nagged in every new tab.
 * Completing the flow sets `onboarded_at` server-side, which supersedes this.
 *
 * Dismiss is broadcast across hook instances via a module-level
 * subscriber list — without this, the hook instance INSIDE the modal
 * calling ``dismiss()`` does not signal the instance in Layout, and
 * the modal re-mounts on the next render because Layout still sees
 * ``dismissed === false``. (``useState(() => sessionStorage…)`` only
 * reads on mount; subsequent storage writes never propagate without
 * an explicit broadcast.)
 */
import { useCallback, useEffect, useState } from 'react';

import { useAuthOptional } from '../context/AuthContext';
import { useAgentiveCapability } from '../features/settings/hooks/useAgentiveCapability';

const DISMISS_KEY = 'integral.onboarding.dismissed';

// Module-level subscribers — every hook instance registers a setter
// here so a dismiss() call from ANY instance propagates to ALL
// instances in the same tab.
const _subscribers: Set<(v: boolean) => void> = new Set();

function _readDismissed(): boolean {
  try {
    return localStorage.getItem(DISMISS_KEY) === '1';
  } catch {
    return false;
  }
}

function _broadcastDismiss(value: boolean): void {
  try {
    if (value) {
      localStorage.setItem(DISMISS_KEY, '1');
    } else {
      localStorage.removeItem(DISMISS_KEY);
    }
  } catch {
    /* ignore quota / privacy-mode errors */
  }
  for (const fn of _subscribers) {
    try {
      fn(value);
    } catch {
      /* never let one bad subscriber block the rest */
    }
  }
}

export interface FirstLoginOnboardingState {
  shouldOnboard: boolean;
  agentiveEnabled: boolean;
  dismiss: () => void;
}

export function useFirstLoginOnboarding(): FirstLoginOnboardingState {
  const auth = useAuthOptional();
  const { enabled: agentiveEnabled } = useAgentiveCapability();
  const [dismissed, setDismissed] = useState<boolean>(() => _readDismissed());

  // Subscribe to module-level broadcasts so a dismiss() call from a
  // peer hook instance (e.g. the one inside OnboardingModal) flips
  // THIS instance's state too.
  useEffect(() => {
    _subscribers.add(setDismissed);
    return () => {
      _subscribers.delete(setDismissed);
    };
  }, []);

  const dismiss = useCallback(() => {
    _broadcastDismiss(true);
  }, []);

  const user = auth?.user ?? null;
  const isLoading = auth?.loading ?? false;
  const onboardedAt = user?.onboarded_at ?? null;
  const hireGatesActive =
    Boolean(user?.must_change_password) ||
    Boolean(
      user?.pending_assigned_form?.url?.trim() ||
        user?.pending_onboarding_form?.url?.trim(),
    );
  const shouldOnboard =
    !isLoading && !!user && !onboardedAt && !dismissed && !hireGatesActive;

  return { shouldOnboard, agentiveEnabled, dismiss };
}
