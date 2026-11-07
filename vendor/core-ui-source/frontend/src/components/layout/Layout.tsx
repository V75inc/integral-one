import { Outlet, useLocation } from 'react-router-dom';
import { Suspense, useEffect, useMemo, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Text } from '../../ui';
import { LINE_ICON_STROKE } from '../ui';
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';
import { AssistantDock, AssistantDockToggle } from '../../features/ai-chat';
import { SidebarDockSync } from '../../features/ai-chat/dock/SidebarDockSync';
import {
  AssistantDockProvider,
  isDockSuppressedPath,
  useAssistantDock,
} from '../../context/AssistantDockContext';
import { useIsMdUp } from '../../hooks/useMediaQuery';
import { useCrumbs } from '../../context/CrumbsContext';
import { useScope } from '../../context/ScopeContext';
import { CommandPalette } from '../command/CommandPalette';
import { useFirstLoginOnboarding } from '../../hooks/useFirstLoginOnboarding';
import { OnboardingDockAutoOpen } from '../../features/ai-chat/dock/OnboardingDockAutoOpen';
import { OnboardingGetStartedBanner } from '../onboarding/OnboardingGetStartedBanner';
import { MustChangePasswordModal } from '../auth/MustChangePasswordModal';
import { MemberAssignedFormPromptModal } from '../../features/memberAssignedForm/MemberAssignedFormPromptModal';
import { EmailVerificationBanner } from './EmailVerificationBanner';
import { getRegisteredLayoutBanners } from '../../host/registry';
import { ChatPageFocusProvider } from '../../context/ChatPageFocusContext';
import { useChangeEventInvalidation } from '../../hooks/useChangeEventInvalidation';
import { useAgentiveWebSocket } from '../../hooks/useAgentiveWebSocket';
import { stitchLayoutCrumbs } from './stitchLayoutCrumbs';

function GraphMutationInvalidationWatcher() {
  useChangeEventInvalidation();
  return null;
}

function AgentEventsWebSocketWatcher() {
  useAgentiveWebSocket();
  return null;
}

/**
 * ⌘J / Ctrl+J toggles the assistant dock — the keyboard twin of the ⌘K
 * palette's "Open harness chat" entry, for people who live on the keyboard.
 * Lives beside (not inside) Layout's ⌘K handler only because the dock
 * context is provided by Layout itself, so this has to mount underneath it.
 * No-op on `/agent`, where the dock is suppressed in favour of the full-page
 * surface and a toggle would flip persisted state with nothing on screen.
 */
export function AssistantDockHotkey() {
  const { toggleDock } = useAssistantDock();
  const { pathname } = useLocation();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (!mod || e.altKey || e.shiftKey) return;
      if (e.key !== 'j' && e.key !== 'J') return;
      if (isDockSuppressedPath(pathname)) return;
      e.preventDefault();
      toggleDock();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [toggleDock, pathname]);
  return null;
}

/**
 * Layout — the application shell.
 *
 * Composition:
 *   ┌──────────┬───────────────────────────────────┐
 *   │          │  TopBar (crumbs · ⌘K · avatar)    │
 *   │ Sidebar  ├───────────────────────────────────┤
 *   │          │                                   │
 *   │          │  <Outlet />                       │
 *   │          │                                   │
 *   └──────────┴───────────────────────────────────┘
 *
 * Sidebar bg matches main bg (no visible vertical divider) so the rail
 * dissolves into the page — Quiet Premium aesthetic.
 *
 * Per-page breadcrumbs come from `CrumbsContext`; pages call
 * `useSetCrumbs([...])` in a `useEffect` to publish their trail.
 * Pages that don't publish fall back to a URL-derived single crumb.
 */
export function Layout() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const isMdUp = useIsMdUp();
  const location = useLocation();
  const { crumbs } = useCrumbs();
  const { activeWorkspace } = useScope();

  // Stitch a canonical breadcrumb prefix onto whatever each page publishes.
  // See stitchLayoutCrumbs for Home › [Workspace ›] <page tail> rules.
  const crumbsWithPrefix = useMemo(
    () => stitchLayoutCrumbs(crumbs, location.pathname, activeWorkspace),
    [crumbs, activeWorkspace, location.pathname],
  );
  // The brief guide remains available independently of the assistant dock.
  const { shouldOnboard } = useFirstLoginOnboarding();

  useEffect(() => {
    if (isMdUp) setMobileNavOpen(false);
  }, [isMdUp]);

  useEffect(() => {
    setMobileNavOpen(false);
  }, [location.pathname]);

  // Global ⌘K / Ctrl+K shortcut. Avoid hijacking the binding when the user
  // is mid-typing in a contentEditable field that explicitly wants the key.
  // (⌘J for the assistant dock lives in AssistantDockHotkey below — it needs
  // the dock context, which this component provides rather than consumes.)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (mod && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault();
        setPaletteOpen(v => !v);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    if (!isMdUp && mobileNavOpen) {
      const prev = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = prev;
      };
    }
    return undefined;
  }, [isMdUp, mobileNavOpen]);

  const mainMarginClass =
    isMdUp && sidebarCollapsed
      ? 'md:ml-[60px]'
      : isMdUp
        ? 'md:ml-[264px]'
        : 'ml-0';

  // Fullbleed routes own the full viewport beneath the topbar. They handle
  // their own clearance for any controls the transparent topbar would cover.
  const FULLBLEED_PATHS = ['/agent'];
  const fullbleed = FULLBLEED_PATHS.some(
    p => location.pathname === p || location.pathname.startsWith(`${p}/`),
  );

  return (
    <ChatPageFocusProvider>
      <AssistantDockProvider>
      {/* Trades the left rail for the dock's width while it is open. */}
      <SidebarDockSync
        collapsed={sidebarCollapsed}
        onCollapsedChange={setSidebarCollapsed}
      />
      <GraphMutationInvalidationWatcher />
      <AgentEventsWebSocketWatcher />
      <AssistantDockHotkey />
    <div
      className="bg-[var(--bg)] text-[var(--text)]"
      // Subtract the live system-bar height from 100vh so chrome doesn't
      // overflow when the bar mounts. Outer App wrapper applies the
      // corresponding padding-top for the push-down squeeze.
      style={{ minHeight: 'calc(100vh - var(--system-bar-h, 0px))' }}
    >
      {/* Register notices with the single global bar. Guidance queues behind
          operational notices without introducing a separate layout strip. */}
      <EmailVerificationBanner />
      {getRegisteredLayoutBanners().map((Banner, i) => (
        <Banner key={i} />
      ))}
      {shouldOnboard ? (
        <OnboardingGetStartedBanner />
      ) : null}
      {/* Skip link — first focusable element on the page. Sighted users never
          see it; keyboard users press Tab once and land here. */}
      <a
        href="#main-content"
        className="
          sr-only focus:not-sr-only
          focus:absolute focus:top-4 focus:left-4 focus:z-max
          focus:px-4 focus:py-2
          focus:bg-[var(--cta-bg)] focus:text-[var(--cta-fg)]
          focus:rounded-[var(--radius-input)]
          focus:text-sm focus:font-medium
          focus:shadow-[var(--shadow-pop)]
          focus:outline-none focus:ring-2 focus:ring-[var(--focus-ring-color)]
        "
      >
        Skip to main content
      </a>
      {/* Mobile-only scrim when the drawer is open. */}
      {!isMdUp && mobileNavOpen ? (
        <button
          type="button"
          aria-label="Close menu"
          className="fixed inset-0 z-scrim bg-black/50 md:hidden"
          onClick={() => setMobileNavOpen(false)}
        />
      ) : null}

      <Sidebar
        collapsed={sidebarCollapsed}
        onToggleCollapsed={() => setSidebarCollapsed(v => !v)}
        mobileOpen={mobileNavOpen}
        onMobileOpenChange={setMobileNavOpen}
        isDesktop={isMdUp}
      />

      <main
        id="main-content"
        className={`assistant-dock-squeeze relative flex flex-col transition-[margin-left] duration-200 ${mainMarginClass}`}
        // Mirror the root's bar-aware min-height so fullbleed routes
        // (chat) get exactly the remaining viewport, no overflow.
        // `margin-right` yields room to the assistant dock; the var is 0
        // whenever the dock isn't squeezing (closed, mobile, /agent).
        style={{
          minHeight: 'calc(100vh - var(--system-bar-h, 0px))',
          marginRight: 'var(--assistant-dock-w, 0px)',
        }}
      >
        {/* Top bar — transparent, absolutely positioned so it overlays content
            but scrolls away with the page (unlike `fixed`). Empty middle is
            click-through; control clusters intercept their own pointer events.
            That second sentence used to be false: the wrapper here re-enabled
            pointer events for the WHOLE bar, so its empty middle swallowed
            clicks on whatever the page rendered in the top ~58px. TopBar now
            owns the distinction per cluster. */}
        <div className="absolute inset-x-0 top-0 z-topbar pointer-events-none">
          <TopBar
            crumbs={crumbsWithPrefix}
            isDesktop={isMdUp}
            mobileNavOpen={mobileNavOpen}
            onToggleMobileNav={() => setMobileNavOpen(v => !v)}
          />
        </div>
        <div
          className={`w-full min-w-0 flex-1 ${
            fullbleed ? '' : 'pt-[var(--app-topbar-height)]'
          }`}
        >
          {/* Reset the page boundary on navigation. A revealed, unkeyed
              Suspense boundary retains the old route during Router transitions,
              making slow lazy imports look like ignored clicks. Keep the shell
              outside it so another navigation can interrupt the pending page. */}
          <Suspense key={location.pathname} fallback={
            <div role="status" aria-label="Loading page" className="flex min-h-48 items-center justify-center gap-2 px-6 py-12">
              <Loader2 size={16} strokeWidth={LINE_ICON_STROKE} className="animate-spin" aria-hidden />
              <Text variant="body-sm" tone="muted">Loading page…</Text>
            </div>
          }>
            <Outlet />
          </Suspense>
        </div>
      </main>

      {/* Phase 9 Plan 09-05 (ONBD-01) — first-login modal (A2). Mounts
          only when the user hasn't onboarded AND the agentive layer is
          reachable. When `agentiveEnabled === false` the banner above
          renders instead (A5). */}
      {/* First login opens the dock seeded for onboarding instead of a
          full-screen takeover — see OnboardingDockAutoOpen. */}
      <OnboardingDockAutoOpen />
      <MustChangePasswordModal />
      <MemberAssignedFormPromptModal />

      {/* Resident assistant — right-anchored dock plus its floating toggle.
          The dock squeezes <main> rather than covering it, so the page stays
          usable while the assistant is open. */}
      <AssistantDock />
      <AssistantDockToggle />

      {/* ⌘K command palette — mounted at root so it overlays any page. */}
      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
      />
    </div>
      </AssistantDockProvider>
    </ChatPageFocusProvider>
  );
}
