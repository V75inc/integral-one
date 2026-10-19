/**
 * The interesting rule is "restore only what you took". Auto-collapsing is
 * easy; the bug worth guarding is the one where closing the dock re-expands a
 * rail the user deliberately collapsed, silently overriding a choice they
 * made by hand.
 */

import React, { useState } from 'react';
import { describe, it, expect, beforeEach } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

import {
  AssistantDockProvider,
  useAssistantDock,
} from '../../../../context/AssistantDockContext';
import { SidebarDockSync } from '../SidebarDockSync';

/** Mirrors Layout: owns the sidebar state, mounts the sync inside the dock
 *  provider, and exposes both as controls the test can drive. */
function Harness({ initialCollapsed = false }: { initialCollapsed?: boolean }) {
  const [collapsed, setCollapsed] = useState(initialCollapsed);
  return (
    <MemoryRouter initialEntries={['/']}>
      <AssistantDockProvider>
        <SidebarDockSync collapsed={collapsed} onCollapsedChange={setCollapsed} />
        <span data-testid="collapsed">{String(collapsed)}</span>
        <button onClick={() => setCollapsed((c) => !c)}>toggle-sidebar</button>
        <DockControls />
      </AssistantDockProvider>
    </MemoryRouter>
  );
}

function DockControls() {
  const { openDock, closeDock } = useAssistantDock();
  return (
    <>
      {/* Wrapped, not passed by reference — the click event would land in
          openDock's options argument. */}
      <button onClick={() => openDock()}>open-dock</button>
      <button onClick={() => closeDock()}>close-dock</button>
    </>
  );
}

const collapsed = () => screen.getByTestId('collapsed').textContent;
const click = (name: string) => act(() => { screen.getByText(name).click(); });

describe('SidebarDockSync', () => {
  beforeEach(() => localStorage.clear());

  it('collapses the rail on open and restores it on close', () => {
    render(<Harness />);
    expect(collapsed()).toBe('false');

    click('open-dock');
    expect(collapsed()).toBe('true');

    click('close-dock');
    expect(collapsed()).toBe('false');
  });

  it('leaves a hand-collapsed rail collapsed after the dock closes', () => {
    render(<Harness initialCollapsed />);

    click('open-dock');
    expect(collapsed()).toBe('true');

    // We never took anything, so we have nothing to give back.
    click('close-dock');
    expect(collapsed()).toBe('true');
  });

  it('yields to the user expanding the rail while the dock is open', () => {
    render(<Harness />);

    click('open-dock');
    expect(collapsed()).toBe('true');

    // User overrides mid-session — that decision has to survive the close.
    click('toggle-sidebar');
    expect(collapsed()).toBe('false');

    click('close-dock');
    expect(collapsed()).toBe('false');
  });

  it('collapses on mount when the dock restored itself open', () => {
    // Dock state persists across reloads; the sidebar's does not, so a
    // restored-open dock has to re-take the rail on mount.
    localStorage.setItem('integral:assistant-dock:open', '1');
    render(<Harness />);
    expect(collapsed()).toBe('true');
  });
});
