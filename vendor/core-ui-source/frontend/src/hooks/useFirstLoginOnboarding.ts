/**
 * Phase 9 Plan 09-05 (ONBD-01) — first-login onboarding mount decision.
 *
 * Reads the authenticated User's `onboarded_at` and the device-local
 * dismissal for that user to decide whether to show first-time guidance.
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
const _subscribers: Set<(key: string, v: boolean) => void> = new Set();

function _readDismissed(key: string): boolean {
  try {
    return localStorage.getItem(key) === '1';
  } catch {
    return false;
  }
}

function _broadcastDismiss(key: string, value: boolean): void {
  try {
    if (value) {
      localStorage.setItem(key, '1');
    } else {
      localStorage.removeItem(key);
    }
  } catch {
    /* ignore quota / privacy-mode errors */
  }
  for (const fn of _subscribers) {
    try {
      fn(key, value);
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
  const user = auth?.user ?? null;
  const key = user?.id ? `${DISMISS_KEY}:${user.id}` : '';
  const [dismissal, setDismissal] = useState(() => ({ key, value: key ? _readDismissed(key) : false }));
  const dismissed = dismissal.key === key ? dismissal.value : Boolean(key && _readDismissed(key));

  // Subscribe to module-level broadcasts so a dismiss() call from a
  // peer hook instance (e.g. the one inside OnboardingModal) flips
  // THIS instance's state too.
  useEffect(() => {
    const update = (updatedKey: string, value: boolean) => {
      if (updatedKey === key) setDismissal({ key, value });
    };
    const onStorage = (event: StorageEvent) => {
      if (event.key === key) update(key, event.newValue === '1');
    };
    _subscribers.add(update);
    window.addEventListener('storage', onStorage);
    return () => {
      _subscribers.delete(update);
      window.removeEventListener('storage', onStorage);
    };
  }, [key]);

  const dismiss = useCallback(() => {
    if (key) _broadcastDismiss(key, true);
  }, [key]);

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
