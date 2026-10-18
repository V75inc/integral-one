import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { WorkspaceSwitcher } from '../WorkspaceSwitcher';

const mockNavigate = vi.fn();
const mockSetScope = vi.fn();

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

vi.mock('../../../context/ToastContext', () => ({
  useToast: () => ({ showToast: vi.fn() }),
}));

vi.mock('../../../api/workspaces', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../api/workspaces')>();
  return {
    ...actual,
    listWorkspaceOperationalModels: vi.fn().mockResolvedValue([]),
    workspacesApi: {
      ...actual.workspacesApi,
      create: vi.fn(),
    },
  };
});

function renderSwitcher(initialPath: string) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[initialPath]}>
        <Routes>
          <Route
            path="*"
            element={
              <ScopeHarness>
                <WorkspaceSwitcher />
              </ScopeHarness>
            }
          />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function ScopeHarness({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

vi.mock('../../../context/ScopeContext', () => ({
  useScope: () => ({
    scope: { workspaceId: 'ws-current' },
    workspaces: [
      {
        id: 'ws-current',
        kind: 'organization',
        name: 'Current WS',
        accent_color: '#ffff00',
        your_role: 'admin',
      },
      {
        id: 'ws-other',
        kind: 'organization',
        name: 'Other WS',
        your_role: 'member',
      },
      {
        id: 'ws-invited-personal',
        kind: 'personal',
        name: 'Workspace A',
        your_role: 'guest',
      },
    ],
    workspacesLoading: false,
    setScope: mockSetScope,
    activeWorkspace: {
      id: 'ws-current',
      kind: 'organization',
      name: 'Current WS',
      accent_color: '#ffff00',
    },
    isPersonal: false,
  }),
}));

describe('WorkspaceSwitcher scope navigation', () => {
  beforeEach(() => {
    mockNavigate.mockReset();
    mockSetScope.mockReset();
  });

  it('applies the active workspace identity color to its fallback avatar', () => {
    renderSwitcher('/feed');
    expect(screen.getByText('CW')).toHaveStyle({
      backgroundColor: 'rgb(255, 255, 0)',
      color: 'rgb(26, 26, 26)',
    });
  });

  it('keeps an unset workspace icon on the default color beside a colored active workspace', () => {
    renderSwitcher('/feed');
    fireEvent.click(screen.getByRole('button', { name: /switch workspace/i }));
    expect(screen.getByText('OW')).toHaveStyle({
      backgroundColor: 'var(--brand-accent-default)',
      color: 'var(--brand-accent-default-contrast)',
    });
  });

  it('navigates to the selected workspace when leaving a track detail route', () => {
    renderSwitcher('/tracks/n.Track.abc123');
    fireEvent.click(screen.getByRole('button', { name: /switch workspace/i }));
    fireEvent.click(screen.getByRole('option', { name: /other ws/i }));
    expect(mockSetScope).toHaveBeenCalledWith({ workspaceId: 'ws-other' });
    expect(mockNavigate).toHaveBeenCalledWith('/workspaces/ws-other');
  });

  it('does not navigate when selecting the already-active workspace', () => {
    renderSwitcher('/tracks/n.Track.abc123');
    fireEvent.click(screen.getByRole('button', { name: /switch workspace/i }));
    fireEvent.click(screen.getByRole('option', { name: /current ws/i }));
    expect(mockSetScope).toHaveBeenCalledWith({ workspaceId: 'ws-current' });
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('does not navigate when switching workspace from a non-detail route', () => {
    renderSwitcher('/feed');
    fireEvent.click(screen.getByRole('button', { name: /switch workspace/i }));
    fireEvent.click(screen.getByRole('option', { name: /other ws/i }));
    expect(mockSetScope).toHaveBeenCalledWith({ workspaceId: 'ws-other' });
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('identifies a shared Personal workspace as invited, not Personal', () => {
    renderSwitcher('/feed');
    fireEvent.click(screen.getByRole('button', { name: /switch workspace/i }));
    const listbox = screen.getByRole('listbox');
    expect(listbox.textContent).toContain('Workspace A');
    expect(listbox.textContent).toContain('Invited');
    expect(listbox.textContent).not.toContain('Personal');
  });
});
