import { lazy, Suspense, type ReactNode } from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { BrowserRouter, Link, MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Layout } from '../Layout';

vi.mock('../Sidebar', () => ({ Sidebar: () => <nav aria-label="Primary navigation">
  <Link to="/slow">Slow page</Link><Link to="/fast">Fast page</Link>
</nav> }));
vi.mock('../TopBar', () => ({ TopBar: () => <div>Persistent toolbar</div> }));
vi.mock('../../../features/ai-chat', () => ({
  AssistantDock: () => <div>Persistent assistant</div>, AssistantDockToggle: () => null,
}));
vi.mock('../../../features/ai-chat/dock/SidebarDockSync', () => ({ SidebarDockSync: () => null }));
vi.mock('../../../context/AssistantDockContext', () => ({
  AssistantDockProvider: ({ children }: { children: ReactNode }) => children,
  useAssistantDock: () => ({ toggleDock: vi.fn() }), isDockSuppressedPath: () => false,
}));
vi.mock('../../../context/ChatPageFocusContext', () => ({
  ChatPageFocusProvider: ({ children }: { children: ReactNode }) => children,
}));
vi.mock('../../../context/CrumbsContext', () => ({ useCrumbs: () => ({ crumbs: [] }) }));
vi.mock('../../../context/ScopeContext', () => ({ useScope: () => ({ activeWorkspace: null }) }));
vi.mock('../../../hooks/useMediaQuery', () => ({ useIsMdUp: () => true }));
vi.mock('../../../hooks/useFirstLoginOnboarding', () => ({ useFirstLoginOnboarding: () => ({ shouldOnboard: false }) }));
vi.mock('../../../hooks/useChangeEventInvalidation', () => ({ useChangeEventInvalidation: () => {} }));
vi.mock('../../../hooks/useAgentiveWebSocket', () => ({ useAgentiveWebSocket: () => {} }));
vi.mock('../../../host/registry', () => ({ getRegisteredLayoutBanners: () => [] }));
vi.mock('../../command/CommandPalette', () => ({ CommandPalette: () => null }));
vi.mock('../../../features/ai-chat/dock/OnboardingDockAutoOpen', () => ({ OnboardingDockAutoOpen: () => null }));
vi.mock('../../onboarding/OnboardingGetStartedBanner', () => ({ OnboardingGetStartedBanner: () => null }));
vi.mock('../../auth/MustChangePasswordModal', () => ({ MustChangePasswordModal: () => null }));
vi.mock('../../../features/memberAssignedForm/MemberAssignedFormPromptModal', () => ({ MemberAssignedFormPromptModal: () => null }));
vi.mock('../EmailVerificationBanner', () => ({ EmailVerificationBanner: () => null }));

afterEach(() => { cleanup(); window.history.replaceState(null, '', '/'); });

function renderDelayedRoute() {
  let finish!: (value: { default: () => ReactNode }) => void;
  const SlowPage = lazy(() => new Promise<{ default: () => ReactNode }>(resolve => { finish = resolve; }));
  render(<MemoryRouter initialEntries={['/fast']}>
    {/* Matches App's outer boundary and React Router's transition-based navigation. */}
    <Suspense fallback={<div>Global loading</div>}>
      <Routes>
        <Route element={<Layout />}>
          <Route path="fast" element={<h1>Fast content</h1>} />
          <Route path="slow" element={<SlowPage />} />
        </Route>
      </Routes>
    </Suspense>
  </MemoryRouter>);
  return () => finish({ default: () => <h1>Slow content</h1> });
}

describe('page loading and navigation', () => {
  it('shows local loading immediately and allows leaving an unresolved page', async () => {
    const finish = renderDelayedRoute();
    fireEvent.click(screen.getByRole('link', { name: 'Slow page' }));
    expect(await screen.findByRole('status', { name: 'Loading page' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Fast content' })).not.toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Primary navigation' })).toBeVisible();
    expect(screen.getByText('Persistent toolbar')).toBeVisible();
    expect(screen.getByText('Persistent assistant')).toBeVisible();
    expect(screen.queryByText('Global loading')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('link', { name: 'Fast page' }));
    expect(await screen.findByRole('heading', { name: 'Fast content' })).toBeInTheDocument();
    expect(screen.queryByRole('status', { name: 'Loading page' })).not.toBeInTheDocument();
    await act(async () => finish());
    expect(screen.queryByRole('heading', { name: 'Slow content' })).not.toBeInTheDocument();
  });

  it('renders the requested page when its module finishes loading', async () => {
    const finish = renderDelayedRoute();
    fireEvent.click(screen.getByRole('link', { name: 'Slow page' }));
    await screen.findByRole('status', { name: 'Loading page' });
    await act(async () => finish());
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Slow content' })).toBeInTheDocument());
    expect(screen.queryByRole('status', { name: 'Loading page' })).not.toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Primary navigation' })).toBeVisible();
  });
  it('does not retain Track content after BrowserRouter changes the URL to a delayed Apps route', async () => {
    let finish!: (value: { default: () => ReactNode }) => void;
    const Apps = lazy(() => new Promise<{ default: () => ReactNode }>(resolve => { finish = resolve; }));
    window.history.replaceState(null, '', '/tracks/qa');
    render(<BrowserRouter><Suspense fallback={<div>Global loading</div>}><Routes>
      <Route element={<Layout />}>
        <Route path="tracks/:id" element={<><h1>QA Bug Tracker 2026 — Bugs</h1><Link to="/apps">Go to Apps</Link></>} />
        <Route path="apps" element={<Apps />} />
        <Route path="fast" element={<h1>Fast content</h1>} />
      </Route>
    </Routes></Suspense></BrowserRouter>);
    fireEvent.click(screen.getByRole('link', { name: 'Go to Apps' }));
    expect(window.location.pathname).toBe('/apps');
    expect(await screen.findByRole('status', { name: 'Loading page' })).toBeVisible();
    expect(screen.queryByRole('heading', { name: 'QA Bug Tracker 2026 — Bugs' })).not.toBeInTheDocument();
    await act(async () => finish({ default: () => <h1>Apps view</h1> }));
    expect(await screen.findByRole('heading', { name: 'Apps view' })).toBeVisible();
    expect(screen.queryByText('Global loading')).not.toBeInTheDocument();
  });

});
