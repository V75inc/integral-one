/**
 * Phase 9 Plan 09-05 (ONBD-01) — A5 fallback banner.
 *
 * Renders when ``useAgentiveCapability().enabled === false`` AND the
 * user has not yet onboarded. Replaces the modal with a thin banner
 * pointing the caller at Settings → Get started so the UI is never
 * broken when the agentive layer is unreachable.
 */
import { Link } from 'react-router-dom';

import { useFirstLoginOnboarding } from '../../hooks/useFirstLoginOnboarding';

export function OnboardingGetStartedBanner() {
  const { dismiss } = useFirstLoginOnboarding();
  return (
    <div
      role="status"
      aria-live="polite"
      className="
        sticky top-0 z-topbar flex items-center justify-between gap-3
        border-b border-[var(--border-subtle)]
        bg-[var(--brand-accent-soft)]
        px-4 py-2 text-sm text-[var(--text)]
      "
    >
      <span>
        Welcome to Integral. Visit{' '}
        <Link
          to="/settings#get-started"
          className="text-[var(--brand-accent)] underline"
        >
          Settings → Get started
        </Link>{' '}
        to begin.
      </span>
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss welcome banner"
        className="
          flex h-6 w-6 items-center justify-center rounded-[var(--radius-input)]
          text-[var(--text-muted)]
          hover:bg-[var(--panel-2)] hover:text-[var(--text)] transition
          focus:outline-none focus:ring-2 focus:ring-[var(--focus-ring-color)]
        "
      >
        ×
      </button>
    </div>
  );
}
