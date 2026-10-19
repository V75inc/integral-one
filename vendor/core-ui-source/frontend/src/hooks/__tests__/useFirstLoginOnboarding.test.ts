/**
 * Phase 9 Plan 09-05 (ONBD-01) — useFirstLoginOnboarding() hook tests.
 *
 * Three behaviours:
 *
 *  1. ``shouldOnboard === false`` when ``user.onboarded_at`` is set.
 *  2. ``shouldOnboard === true`` when ``user.onboarded_at`` is null AND
 *     the agentive layer is reachable.
 *  3. ``dismiss()`` flips ``shouldOnboard`` to false and persists the
 *     flag (localStorage) so future renders — including a fresh mount /
 *     new tab — also skip.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, cleanup } from '@testing-library/react';

afterEach(() => {
  cleanup();
  try {
    localStorage.clear();
    sessionStorage.clear();
  } catch {
    /* jsdom may not surface storage in all envs */
  }
});

// Mock the agentive-capability probe so we can swing it without
// firing real HTTP requests. Default = enabled; individual tests
// override.
vi.mock('../../features/settings/hooks/useAgentiveCapability', () => ({
  useAgentiveCapability: () => ({ enabled: true, isLoading: false })
}));

// Mock the optional auth context so tests pick the user shape they need.
const mockAuth = {
  user: null as { onboarded_at?: string | null } | null,
  loading: false
};
vi.mock('../../context/AuthContext', () => ({
  useAuthOptional: () => mockAuth
}));

import { useFirstLoginOnboarding } from '../useFirstLoginOnboarding';

beforeEach(() => {
  mockAuth.user = null;
  mockAuth.loading = false;
});

describe('useFirstLoginOnboarding', () => {
  it('returns shouldOnboard=false when user.onboarded_at is set', () => {
    mockAuth.user = { onboarded_at: '2026-05-01T00:00:00Z' };
    const { result } = renderHook(() => useFirstLoginOnboarding());
    expect(result.current.shouldOnboard).toBe(false);
    expect(result.current.agentiveEnabled).toBe(true);
  });

  it('returns shouldOnboard=true when user.onboarded_at is null', () => {
    mockAuth.user = { onboarded_at: null };
    const { result } = renderHook(() => useFirstLoginOnboarding());
    expect(result.current.shouldOnboard).toBe(true);
    expect(result.current.agentiveEnabled).toBe(true);
  });

  it('dismiss() flips shouldOnboard to false', () => {
    mockAuth.user = { onboarded_at: null };
    const { result } = renderHook(() => useFirstLoginOnboarding());
    expect(result.current.shouldOnboard).toBe(true);
    act(() => {
      result.current.dismiss();
    });
    expect(result.current.shouldOnboard).toBe(false);
  });

  it('dismiss persists across a fresh mount (durable, not per-tab)', () => {
    mockAuth.user = { onboarded_at: null };
    const first = renderHook(() => useFirstLoginOnboarding());
    act(() => {
      first.result.current.dismiss();
    });
    first.unmount();

    // A brand-new hook instance (as a new tab would create) still skips.
    const second = renderHook(() => useFirstLoginOnboarding());
    expect(second.result.current.shouldOnboard).toBe(false);
    expect(localStorage.getItem('integral.onboarding.dismissed')).toBe('1');
  });
});
