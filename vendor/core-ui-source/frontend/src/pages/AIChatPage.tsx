import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Menu, MessageSquare, X } from 'lucide-react';
import {
  AIChatRuntimeBoundary,
  AIChatThread,
  AIChatThreadList,
  useActiveChatProvider,
} from "../features/ai-chat";
import { useSetCrumbs } from "../context/CrumbsContext";
import { useIsMdUp } from "../hooks/useMediaQuery";
import { LINE_ICON_STROKE } from "../components/ui";
import { useScope } from "../context/ScopeContext";
import { useAssistantDock } from "../context/AssistantDockContext";
import { InboxView } from "../features/ai-chat/inbox/InboxView";
import { tracksApi } from '../api';
import { tracksListQueryKey } from '../queryKeys';
import { usePublishPageContext } from '../hooks/usePublishPageContext';

/**
 * AIChatPage — fullbleed two-column chat surface on desktop, drawer +
 * thread on mobile.
 *
 * Desktop ( md+ ): thread list rail (w-72) sits next to the active
 * thread (flex-1). Both panes share a single AIChatRuntimeBoundary so
 * they stay in sync.
 *
 * Mobile ( < md ): the thread list collapses behind a slide-over
 * drawer triggered by a "Threads" button in the page header. The
 * active thread takes the full width. Selecting a thread (or tapping
 * the scrim) closes the drawer so the user lands directly on the
 * conversation.
 */
export function AIChatPage() {
  // Suppress the URL-derived breadcrumb — chat is its own surface and
  // doesn't read like a navigated section.
  useSetCrumbs([]);
  const provider = useActiveChatProvider();
  const isMdUp = useIsMdUp();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const { activeWorkspace } = useScope();
  const scopeLabel = activeWorkspace?.name?.trim() || 'Workspace';
  const [searchParams, setSearchParams] = useSearchParams();
  const deepLinkThreadId = searchParams.get('thread');
  const workspaceId = activeWorkspace?.id ?? null;
  // `/agent` replaces the page the user arrived from, so it must publish its
  // own scoped context instead of inheriting a now-unmounted page's snapshot.
  // The track list stays out of the prompt stub and is available only through
  // `integral_get_page_context` when the resident harness needs it.
  const tracksQuery = useQuery({
    queryKey: [...tracksListQueryKey(''), workspaceId] as const,
    queryFn: () => tracksApi.list({ limit: 100, skipEntryCounts: true }),
    enabled: Boolean(workspaceId),
  });
  const tracks = tracksQuery.data ?? [];

  usePublishPageContext({
    pageKind: 'agent_workspace',
    visibleData: {
      tracks: tracks.map(track => ({
        id: track.id,
        title: track.title || undefined,
      })),
      total_count: tracks.length,
    },
    metadata: {
      active_workspace_id: workspaceId,
      active_workspace_name: activeWorkspace?.name ?? null,
      active_workspace_kind: activeWorkspace?.kind ?? null,
    },
  });
  // A `?thread=` deep link names a thread in the workspace it was opened in.
  // Drop it when the user switches workspaces so neither the boundary key
  // nor the runtime's initial selection carries the stale id across. The
  // first resolution (`null -> ws`) is a mount, not a switch.
  const previousWorkspaceIdRef = useRef<string | null>(workspaceId);
  useEffect(() => {
    const previous = previousWorkspaceIdRef.current;
    previousWorkspaceIdRef.current = workspaceId;
    if (previous == null || workspaceId == null || previous === workspaceId) return;
    if (!searchParams.has('thread')) return;
    const next = new URLSearchParams(searchParams);
    next.delete('thread');
    setSearchParams(next, { replace: true });
    // Only a workspace change should clear the param — not a param change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId]);
  // Shared with the dock, so the tab you were on survives expanding to full
  // screen. The inbox is user-scoped work, not a property of this layout.
  const { view, setView } = useAssistantDock();

  // Auto-close drawer when viewport grows past md so the user doesn't
  // see a stuck overlay after rotating their device.
  useEffect(() => {
    if (isMdUp) setDrawerOpen(false);
  }, [isMdUp]);

  // Lock body scroll while the drawer is open on mobile, matching the
  // pattern the Layout uses for its sidebar drawer.
  useEffect(() => {
    if (!isMdUp && drawerOpen) {
      const prev = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = prev;
      };
    }
    return undefined;
  }, [isMdUp, drawerOpen]);

  return (
    <div
      className="flex min-h-0 bg-[var(--section-bg)]"
      style={{ height: 'calc(100vh - var(--system-bar-h, 0px))' }}
    >
      <AIChatRuntimeBoundary
        key={`${provider.id}:${deepLinkThreadId ?? ''}`}
        provider={provider}
        initialThreadId={deepLinkThreadId}
      >
        {/* Desktop rail — visible at md+ only. It is the navigation column,
            so it owns the Chat/Inbox switch: the tabs choose what fills the
            main pane, the list below chooses which conversation. */}
        <div
          className="hidden h-full w-72 shrink-0 flex-col bg-[var(--panel)] md:flex"
          /* Only a small clearance, not the full --app-topbar-height. The
             topbar is an absolutely-positioned, transparent overlay whose
             two control clusters sit at the far left (mobile-only, `md:hidden`
             so zero-width here) and the far right — nothing of it renders over
             this 288px rail, and this page suppresses breadcrumbs entirely
             (`useSetCrumbs([])`), so the middle is empty by construction.
             Reserving all 64px pushed the agent identity row down by an empty
             band and cost the conversation list a row and a half of height.
             The right-hand column keeps the full reserve — the topbar's
             controls really are above it. */
          style={{ paddingTop: '0.75rem' }}
        >
          {/* Live while the Inbox is showing rather than hidden or dimmed —
              picking a conversation is then the way back to it. */}
          <div
            className="min-h-0 flex-1 overflow-hidden"
            onClick={() => {
              if (view === 'inbox') setView('chat');
            }}
          >
            <AIChatThreadList />
          </div>
        </div>

        {/* Mobile drawer — fixed overlay, slides in from the left.
            Animates with the same transition language as the app
            sidebar so the surface feels native. The drawer wraps the
            shared ThreadList primitive (which already renders its own
            "Conversations" eyebrow), so the drawer adds only the close
            affordance — no duplicate section heading. */}
        {!isMdUp ? (
          <>
            {drawerOpen ? (
              <button
                type="button"
                aria-label="Close conversations"
                onClick={() => setDrawerOpen(false)}
                className="fixed inset-0 z-scrim bg-black/50 md:hidden"
              />
            ) : null}
            <div
              role="dialog"
              aria-modal={drawerOpen}
              aria-label="Conversations"
              aria-hidden={!drawerOpen}
              className={[
                'fixed left-0 z-drawer flex w-[min(320px,88vw)] flex-col',
                'bg-[var(--panel)] shadow-2xl',
                'transition-transform duration-200 ease-out',
                drawerOpen ? 'translate-x-0' : '-translate-x-full pointer-events-none',
                'md:hidden',
              ].join(' ')}
              style={{
                top: 'var(--system-bar-h, 0px)',
                height: 'calc(100vh - var(--system-bar-h, 0px))',
                paddingTop: 'var(--app-topbar-height)',
              }}
              /* Tapping any conversation row inside the list closes the
                 drawer so the user can read the conversation immediately. */
              onClick={() => setDrawerOpen(false)}
            >
              {/* Dedicated close-X row at the top of the drawer body so
                  the affordance no longer overlaps the AgentSwitcher's
                  chevron / eyebrow underneath. Sits inside the flow,
                  not absolutely positioned. */}
              <div className="flex items-center justify-end px-2 py-1.5">
                <button
                  type="button"
                  onClick={() => setDrawerOpen(false)}
                  aria-label="Close conversations"
                  className="inline-flex h-8 w-8 items-center justify-center rounded-md text-[var(--text-muted)] hover:bg-[var(--panel-2)] hover:text-[var(--text)]"
                >
                  <X size={16} strokeWidth={LINE_ICON_STROKE} />
                </button>
              </div>
              <div className="min-h-0 flex-1 overflow-hidden">
                <AIChatThreadList />
              </div>
            </div>
          </>
        ) : null}

        {/* Active thread — takes remaining width. On mobile we add a
            small header bar with the drawer toggle so the user can
            still switch threads. */}
        <div
          className="flex min-w-0 flex-1 flex-col"
          style={{ paddingTop: 'var(--app-topbar-height)' }}
        >
          {!isMdUp ? (
            <div className="flex items-center justify-between gap-3 border-b border-[var(--panel-border)] bg-[var(--section-bg)] px-3 py-2">
              <button
                type="button"
                onClick={() => setDrawerOpen(true)}
                aria-label="Show conversations"
                aria-expanded={drawerOpen}
                className="inline-flex shrink-0 items-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium text-[var(--text-muted)] hover:bg-[var(--panel-2)] hover:text-[var(--text)]"
              >
                <Menu size={14} strokeWidth={LINE_ICON_STROKE} />
                Conversations
              </button>
              <span className="inline-flex min-w-0 items-center justify-end gap-1.5 text-[10px] uppercase tracking-[0.08em] text-[var(--text-subtle)]">
                <MessageSquare
                  size={11}
                  strokeWidth={LINE_ICON_STROKE}
                  aria-hidden
                  className="shrink-0"
                />
                <span className="truncate">
                  {scopeLabel
                    ? `${provider.label} · ${scopeLabel}`
                    : provider.label}
                </span>
              </span>
            </div>
          ) : null}
          <div className="min-h-0 flex-1">
            {view === 'inbox' ? (
              /* The inbox was built for the dock's narrow column; rows spanning
                 a full-width desktop are unreadable, so cap and centre it. */
              <div className="mx-auto h-full w-full max-w-3xl">
                <InboxView />
              </div>
            ) : (
              <AIChatThread showHeader={false} />
            )}
          </div>
        </div>
      </AIChatRuntimeBoundary>
    </div>
  );
}
