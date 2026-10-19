/**
 * First login opens the dock instead of a full-screen takeover.
 *
 * The gates matter more than the open itself: firing for an already-onboarded
 * user, or re-firing on every route change, turns the assistant into a nag.
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, cleanup, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const onboardingState = {
  shouldOnboard: true,
  agentiveEnabled: true,
  dismiss: vi.fn(),
};

vi.mock('../../../../hooks/useFirstLoginOnboarding', () => ({
  useFirstLoginOnboarding: () => onboardingState,
}));

import {
  AssistantDockProvider,
  useAssistantDock,
} from '../../../../context/AssistantDockContext';
import { OnboardingDockAutoOpen } from '../OnboardingDockAutoOpen';

function Probe() {
  const { open, onboarding } = useAssistantDock();
  return (
    <span data-testid="state">{`${open ? 'open' : 'closed'}:${onboarding ? 'onboarding' : 'plain'}`}</span>
  );
}

function renderIt() {
  return render(
    <MemoryRouter initialEntries={['/']}>
      <AssistantDockProvider>
        <OnboardingDockAutoOpen />
        <Probe />
      </AssistantDockProvider>
    </MemoryRouter>,
  );
}

const state = () => screen.getByTestId('state').textContent;

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  onboardingState.shouldOnboard = true;
  onboardingState.agentiveEnabled = true;
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('OnboardingDockAutoOpen', () => {
  it('opens the dock with onboarding framing on first login', () => {
    renderIt();
    expect(state()).toBe('open:onboarding');
  });

  it('stays shut for a user who has already onboarded', () => {
    onboardingState.shouldOnboard = false;
    renderIt();
    expect(state()).toBe('closed:plain');
  });

  it('stays shut when the agentive layer is unreachable', () => {
    // The GetStarted banner covers this case; opening an assistant that
    // cannot answer would be worse than not opening one.
    onboardingState.agentiveEnabled = false;
    renderIt();
    expect(state()).toBe('closed:plain');
  });

  it('does not re-open the dock the user closed', () => {
    const first = renderIt();
    expect(state()).toBe('open:onboarding');
    first.unmount();

    // Simulate the user having closed it, then a route change remounting us.
    localStorage.setItem('integral:assistant-dock:open', '0');
    renderIt();
    // Framing survives (they are still onboarding) but we do not force it open.
    expect(state()).toBe('closed:onboarding');
  });
});
