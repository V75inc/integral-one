import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useScopedSuggestions } from '../useScopedSuggestions';

vi.mock('../../../../context/ScopeContext', () => ({
  useScope: vi.fn(),
}));

vi.mock('../../../../context/ChatPageFocusContext', () => ({
  useChatPageContext: vi.fn(),
}));

import { useScope } from '../../../../context/ScopeContext';
import { useChatPageContext } from '../../../../context/ChatPageFocusContext';

const mockUseScope = useScope as ReturnType<typeof vi.fn>;
const mockUseChatPageContext = useChatPageContext as ReturnType<typeof vi.fn>;

describe('useScopedSuggestions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseChatPageContext.mockReturnValue({
      pageKind: null,
      focusedTrackId: null,
      focusedAppId: null,
    });
  });

  it('returns workspace-level chips when no workspace has resolved yet', () => {
    mockUseScope.mockReturnValue({
      scope: null,
      activeWorkspace: null,
      isPersonal: false,
    });

    const { result } = renderHook(() => useScopedSuggestions());

    expect(result.current.length).toBeGreaterThan(0);
    // All suggestions should have label and text
    result.current.forEach(s => {
      expect(s.label).toBeTruthy();
      expect(s.text).toBeTruthy();
    });
    // Generic fallback includes a broad "what can you help me with" style prompt
    const labels = result.current.map(s => s.label);
    expect(labels.some(l => /help/i.test(l))).toBe(true);
  });

  it('returns personal-workspace chips that reference the workspace name', () => {
    mockUseScope.mockReturnValue({
      scope: { workspaceId: 'ws-personal-1' },
      activeWorkspace: { id: 'ws-personal-1', name: 'My Workspace', kind: 'personal' },
      isPersonal: true,
    });

    const { result } = renderHook(() => useScopedSuggestions());

    expect(result.current.length).toBeGreaterThan(0);
    // At least one suggestion should mention the workspace name
    const hasWorkspaceName = result.current.some(
      s => s.label.includes('My Workspace') || s.text.includes('My Workspace'),
    );
    expect(hasWorkspaceName).toBe(true);
  });

  it('returns org-workspace chips that reference the workspace name', () => {
    mockUseScope.mockReturnValue({
      scope: { workspaceId: 'ws-org-1' },
      activeWorkspace: { id: 'ws-org-1', name: 'Acme Corp', kind: 'organization' },
      isPersonal: false,
    });

    const { result } = renderHook(() => useScopedSuggestions());

    expect(result.current.length).toBeGreaterThan(0);
    // At least one suggestion should mention the workspace name
    const hasWorkspaceName = result.current.some(
      s => s.label.includes('Acme Corp') || s.text.includes('Acme Corp'),
    );
    expect(hasWorkspaceName).toBe(true);
  });

  it('returns different suggestions for personal vs org workspace', () => {
    mockUseScope.mockReturnValue({
      scope: { workspaceId: 'ws-personal-1' },
      activeWorkspace: { id: 'ws-personal-1', name: 'My Space', kind: 'personal' },
      isPersonal: true,
    });
    const { result: personalResult } = renderHook(() => useScopedSuggestions());

    mockUseScope.mockReturnValue({
      scope: { workspaceId: 'ws-org-1' },
      activeWorkspace: { id: 'ws-org-1', name: 'My Space', kind: 'organization' },
      isPersonal: false,
    });
    const { result: orgResult } = renderHook(() => useScopedSuggestions());

    // The label sets should differ between personal and org
    const personalLabels = personalResult.current.map(s => s.label).sort().join('|');
    const orgLabels = orgResult.current.map(s => s.label).sort().join('|');
    expect(personalLabels).not.toBe(orgLabels);
  });

  it('prefers page-context chips when pageKind is tracks_list', () => {
    mockUseScope.mockReturnValue({
      scope: { workspaceId: 'ws-1' },
      activeWorkspace: { id: 'ws-1', name: 'Ops', kind: 'personal' },
      isPersonal: true,
    });
    mockUseChatPageContext.mockReturnValue({
      pageKind: 'tracks_list',
      focusedTrackId: null,
      focusedAppId: null,
    });

    const { result } = renderHook(() => useScopedSuggestions());
    const labels = result.current.map(s => s.label);
    expect(labels.some(l => /set up a track/i.test(l))).toBe(true);
  });
});
