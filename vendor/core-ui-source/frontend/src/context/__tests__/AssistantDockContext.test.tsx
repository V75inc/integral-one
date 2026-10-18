/**
 * Assistant dock state.
 *
 * Three things here are easy to regress and invisible until someone hits
 * them by hand:
 *
 *  1. `setWidth` takes an updater. The resize handle nudges by a delta on
 *     every keydown, and key-repeat fires faster than React re-renders — a
 *     `width + step` closure collapses a held arrow key into a single step.
 *     Caught live before it shipped; pinned here.
 *  2. The squeeze is published as a CSS variable, not a prop. If it stops
 *     being written, `<main>` silently stops yielding room and the dock
 *     covers the page instead of docking beside it.
 *  3. The cross-surface open request must be ignored on `/agent`, which
 *     already owns a full-viewport chat surface.
 */

import React from 'react';
import { describe, it, expect, beforeEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

import {
  AssistantDockProvider,
  useAssistantDock,
} from '../AssistantDockContext';
import {
  DOCK_MAX_WIDTH,
  DOCK_MIN_WIDTH,
} from '../../features/ai-chat/dock/assistantDockPrefs';
import { OPEN_AI_CHAT_EVENT } from '../../features/ai-chat/chatHandoff';

function wrapperAt(path: string) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <MemoryRouter initialEntries={[path]}>
        <AssistantDockProvider>{children}</AssistantDockProvider>
      </MemoryRouter>
    );
  };
}

/** jsdom reports 1024px, i.e. md-and-up, so the desktop dock is active. */
function dockVar() {
  return document.documentElement.style.getPropertyValue('--assistant-dock-w');
}

describe('AssistantDockContext', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    document.documentElement.removeAttribute('style');
    document.documentElement.removeAttribute('data-dock-resizing');
  });

  it('opens, closes and persists across a remount', () => {
    const { result, unmount } = renderHook(() => useAssistantDock(), {
      wrapper: wrapperAt('/'),
    });

    expect(result.current.open).toBe(false);
    act(() => result.current.openDock());
    expect(result.current.open).toBe(true);
    unmount();

    const remounted = renderHook(() => useAssistantDock(), {
      wrapper: wrapperAt('/'),
    });
    expect(remounted.result.current.open).toBe(true);
  });

  it('applies successive width nudges instead of coalescing them', () => {
    const { result } = renderHook(() => useAssistantDock(), {
      wrapper: wrapperAt('/'),
    });
    const start = result.current.width;

    // Three deltas dispatched before any re-render — the shape key-repeat
    // produces. With a stale-closure `setWidth(width + 16)` only one lands.
    act(() => {
      result.current.setWidth(w => w + 16);
      result.current.setWidth(w => w + 16);
      result.current.setWidth(w => w + 16);
    });

    expect(result.current.width).toBe(start + 48);
  });

  it('clamps width at both ends', () => {
    const { result } = renderHook(() => useAssistantDock(), {
      wrapper: wrapperAt('/'),
    });

    act(() => result.current.setWidth(10_000));
    expect(result.current.width).toBe(DOCK_MAX_WIDTH);

    act(() => result.current.setWidth(0));
    expect(result.current.width).toBe(DOCK_MIN_WIDTH);
  });

  it('publishes the squeeze only while open', () => {
    const { result } = renderHook(() => useAssistantDock(), {
      wrapper: wrapperAt('/'),
    });

    expect(dockVar()).toBe('0px');
    act(() => result.current.openDock());
    expect(dockVar()).toBe(`${result.current.width}px`);
    act(() => result.current.closeDock());
    expect(dockVar()).toBe('0px');
  });

  it('never squeezes on /agent, which owns its own full-page surface', () => {
    const { result } = renderHook(() => useAssistantDock(), {
      wrapper: wrapperAt('/agent'),
    });

    act(() => result.current.openDock());
    expect(result.current.open).toBe(true);
    expect(dockVar()).toBe('0px');
  });

  it('flags resizing so consumers can drop their transition', () => {
    const { result } = renderHook(() => useAssistantDock(), {
      wrapper: wrapperAt('/'),
    });

    act(() => result.current.setResizing(true));
    expect(document.documentElement.getAttribute('data-dock-resizing')).toBe('1');
    act(() => result.current.setResizing(false));
    expect(document.documentElement.getAttribute('data-dock-resizing')).toBeNull();
  });

  it('opens on a cross-surface handoff request', () => {
    const { result } = renderHook(() => useAssistantDock(), {
      wrapper: wrapperAt('/'),
    });

    expect(result.current.open).toBe(false);
    act(() => {
      window.dispatchEvent(
        new CustomEvent(OPEN_AI_CHAT_EVENT, {
          detail: { threadId: 'thread-1', ts: 1 },
        }),
      );
    });

    expect(result.current.open).toBe(true);
    expect(result.current.view).toBe('chat');
    expect(sessionStorage.getItem('integral:ai-chat-last-thread')).toBe(
      JSON.stringify({ threadId: 'thread-1', workspaceId: null }),
    );
  });

  it('ignores a handoff request while already on /agent', () => {
    const { result } = renderHook(() => useAssistantDock(), {
      wrapper: wrapperAt('/agent'),
    });

    act(() => {
      window.dispatchEvent(
        new CustomEvent(OPEN_AI_CHAT_EVENT, {
          detail: { threadId: 'thread-1', ts: 1 },
        }),
      );
    });

    expect(result.current.open).toBe(false);
  });
});
