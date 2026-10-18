/**
 * ⌘J / Ctrl+J toggles the assistant dock. The ⌘K palette already lists
 * "Open harness chat"; this is the one-chord version for keyboard users.
 * Suppressed on `/agent`, where the dock is hidden in favour of the
 * full-page surface.
 */
import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, cleanup, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

// Layout.tsx pulls the whole shell in; none of it matters to the hotkey.
vi.mock('../Sidebar', () => ({ Sidebar: () => null }));
vi.mock('../TopBar', () => ({ TopBar: () => null }));
vi.mock('../../command/CommandPalette', () => ({ CommandPalette: () => null }));
vi.mock('../EmailVerificationBanner', () => ({ EmailVerificationBanner: () => null }));
vi.mock('../../onboarding/OnboardingGetStartedBanner', () => ({
  OnboardingGetStartedBanner: () => null,
}));
vi.mock('../../../features/ai-chat', () => ({
  AssistantDock: () => null,
  AssistantDockToggle: () => null,
}));
vi.mock('../../../features/ai-chat/dock/SidebarDockSync', () => ({
  SidebarDockSync: () => null,
}));
vi.mock('../../../features/ai-chat/dock/OnboardingDockAutoOpen', () => ({
  OnboardingDockAutoOpen: () => null,
}));
vi.mock('../../../hooks/useFirstLoginOnboarding', () => ({
  useFirstLoginOnboarding: () => ({ shouldOnboard: false, agentiveEnabled: false }),
}));
vi.mock('../../../hooks/useChangeEventInvalidation', () => ({
  useChangeEventInvalidation: () => undefined,
}));
vi.mock('../../../hooks/useAgentiveWebSocket', () => ({
  useAgentiveWebSocket: () => ({ connected: false }),
}));

import {
  AssistantDockProvider,
  useAssistantDock,
} from '../../../context/AssistantDockContext';
import { AssistantDockHotkey } from '../Layout';

function Probe() {
  const { open } = useAssistantDock();
  return <output data-testid="dock-open">{open ? 'open' : 'closed'}</output>;
}

function mount(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AssistantDockProvider>
        <AssistantDockHotkey />
        <Probe />
      </AssistantDockProvider>
    </MemoryRouter>,
  );
}

function press(init: KeyboardEventInit) {
  const ev = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init });
  act(() => {
    window.dispatchEvent(ev);
  });
  return ev;
}

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
});

afterEach(() => {
  cleanup();
});

describe('AssistantDockHotkey', () => {
  it('toggles the dock on ⌘J and Ctrl+J', () => {
    mount('/');
    expect(screen.getByTestId('dock-open')).toHaveTextContent('closed');

    const first = press({ key: 'j', metaKey: true });
    expect(first.defaultPrevented).toBe(true);
    expect(screen.getByTestId('dock-open')).toHaveTextContent('open');

    press({ key: 'J', ctrlKey: true });
    expect(screen.getByTestId('dock-open')).toHaveTextContent('closed');
  });

  it('ignores a bare J and other modifier combinations', () => {
    mount('/');
    press({ key: 'j' });
    press({ key: 'j', metaKey: true, shiftKey: true });
    press({ key: 'j', altKey: true });
    expect(screen.getByTestId('dock-open')).toHaveTextContent('closed');
  });

  it('does nothing on /agent, where the dock is suppressed', () => {
    mount('/agent');
    const ev = press({ key: 'j', metaKey: true });
    expect(ev.defaultPrevented).toBe(false);
    expect(screen.getByTestId('dock-open')).toHaveTextContent('closed');
  });
});
