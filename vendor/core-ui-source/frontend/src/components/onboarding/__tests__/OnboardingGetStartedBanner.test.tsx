import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { OnboardingGetStartedBanner } from '../OnboardingGetStartedBanner';
import { SystemNotificationBar } from '../../system/SystemNotificationBar';
import { getSystemNotificationsApi, SystemNotificationsProvider } from '../../system/SystemNotificationsContext';

const auth = vi.hoisted(() => ({ user: { id: 'first-user', onboarded_at: null } as { id: string; onboarded_at: string | null } | null }));
vi.mock('../../../context/AuthContext', () => ({ useAuthOptional: () => ({ user: auth.user, loading: false }) }));
vi.mock('../../../features/settings/hooks/useAgentiveCapability', () => ({ useAgentiveCapability: () => ({ enabled: false }) }));

function Location() {
  const { pathname, hash } = useLocation();
  return <div aria-label="Current page">{pathname}{hash}</div>;
}

function Shell({ mounted = true }: { mounted?: boolean }) {
  return <SystemNotificationsProvider><MemoryRouter>
    <SystemNotificationBar />
    {mounted ? <OnboardingGetStartedBanner /> : null}
    <Location />
  </MemoryRouter></SystemNotificationsProvider>;
}

beforeEach(() => {
  localStorage.clear();
  auth.user = { id: 'first-user', onboarded_at: null };
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.useRealTimers(); });

describe('first-login guidance in the shared notification bar', () => {
  it('uses a single notification and opens the existing getting-started page', () => {
    render(<Shell />);
    expect(screen.getAllByRole('status')).toHaveLength(1);
    expect(screen.getByRole('status')).toHaveTextContent('Welcome to Integral');
    fireEvent.click(screen.getByRole('button', { name: 'Getting started' }));
    expect(screen.getByLabelText('Current page')).toHaveTextContent('/settings#get-started');
    expect(screen.getAllByRole('status')).toHaveLength(1);
  });

  it.each(['info', 'warning', 'error'] as const)('queues guidance behind a %s notice without dismissing it permanently', type => {
    vi.useFakeTimers();
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
      x: 0, y: 0, width: 1280, height: 57, top: 0, right: 1280,
      bottom: 57, left: 0, toJSON: () => ({}),
    });
    render(<Shell />);
    act(() => {
      getSystemNotificationsApi()!.notify({ id: 'operational', type, title: 'Important notice' });
      vi.advanceTimersByTime(500);
    });
    expect(screen.getAllByRole('status')).toHaveLength(1);
    expect(screen.getByRole('status')).toHaveTextContent('Important notice');
    expect(screen.queryByText('Welcome to Integral')).not.toBeInTheDocument();
    expect(document.documentElement.style.getPropertyValue('--system-bar-h')).toBe('57px');
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss notification' }));
    expect(screen.getAllByRole('status')).toHaveLength(1);
    expect(screen.getByRole('status')).toHaveTextContent('Welcome to Integral');
    expect(document.documentElement.style.getPropertyValue('--system-bar-h')).toBe('57px');
    expect(localStorage.getItem('integral.onboarding.dismissed:first-user')).toBeNull();
  });

  it('persists dismissal for this user and does not register it again on remount', () => {
    const view = render(<Shell />);
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss notification' }));
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(localStorage.getItem('integral.onboarding.dismissed:first-user')).toBe('1');
    view.unmount();
    render(<Shell />);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('clears guidance when the authenticated shell unmounts', () => {
    const { rerender } = render(<Shell />);
    expect(screen.getByRole('status')).toHaveTextContent('Welcome to Integral');
    rerender(<Shell mounted={false} />);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(document.documentElement.style.getPropertyValue('--system-bar-h')).toBe('0px');
    expect(localStorage.getItem('integral.onboarding.dismissed:first-user')).toBeNull();
  });

  it('removes guidance on logout and keeps dismissal isolated between accounts', () => {
    const { rerender } = render(<Shell />);
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss notification' }));
    auth.user = { id: 'second-user', onboarded_at: null };
    rerender(<Shell />);
    expect(screen.getByRole('status')).toHaveTextContent('Welcome to Integral');
    expect(localStorage.getItem('integral.onboarding.dismissed:second-user')).toBeNull();
    auth.user = null;
    rerender(<Shell />);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
});
