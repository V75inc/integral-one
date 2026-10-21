import { createContext, useContext, type ReactNode } from "react";
import { AssistantRuntimeProvider } from "@assistant-ui/react";
import { useAIChatRuntime } from "./useAIChatRuntime";
import type { AIChatThread as ChatThreadRecord } from "../../api/aiChat";
import type { ThreadGroupInfo } from "./threadGrouping";
import { AIChatThread } from "./components/Thread";
import { MockEchoProvider } from "./providers/MockEchoProvider";
import type { ChatProvider } from "./providers/types";
import {
  ChatEntityRefsProvider,
  useChatEntityRefs,
} from "../../context/ChatEntityRefsContext";
import { useScope } from "../../context/ScopeContext";
import { useNavigate } from "react-router-dom";
import { requestOpenCompanionChat } from "./chatHandoff";

/**
 * Context that surfaces runtime-level affordances to descendants of
 * `AssistantRuntimeProvider`:
 *   - `activityText` / `isRunning` — for the inline thinking/working
 *     indicator that ActivityStrip renders.
 *   - `appendAssistantNote(text)` — lets surface code (specifically
 *     the staging cards) inject a deterministic assistant message
 *     into the chat history without triggering a model run. Used
 *     by StagedChangeCard to deliver "✓ Filed *X* in *Y*. Anything
 *     else?" the moment a card resolves to consumed — the model
 *     was unreliable at producing that line so we generate it
 *     client-side instead.
 */
const ChatActivityContext = createContext<{
  activityText: string | null;
  isRunning: boolean;
  streamError: string | null;
  appendAssistantNote: (text: string) => Promise<string | null>;
  activeProviderSessionId: string | null;
  activeProviderId: string;
  /** ChatThread node id for the open thread — what the questions/staging
   *  REST surface keys on (distinct from the provider session id). */
  activeThreadId: string | null;
  composerReady: boolean;
  streamingThreadIds: readonly string[];
  /** Threads busy with a turn this tab did not start. */
  remoteTurns: Record<string, { workspaceId: string | null; turnId: string | null }>;
  isThreadStreaming: (threadId: string) => boolean;
  /** Authorized thread metadata for title search within the active scope. */
  threads: readonly ChatThreadRecord[];
  /** Recency bucket per thread id for the rail. */
  threadGroups: ReadonlyMap<string, ThreadGroupInfo>;
}>({
  activityText: null,
  isRunning: false,
  streamError: null,
  appendAssistantNote: async () => null,
  activeProviderSessionId: null,
  activeProviderId: "",
  activeThreadId: null,
  composerReady: false,
  streamingThreadIds: [],
  remoteTurns: {},
  isThreadStreaming: () => false,
  threads: [],
  threadGroups: new Map(),
});

export function useChatActivity() {
  return useContext(ChatActivityContext);
}

export interface AIChatSurfaceProps {
  /**
   * Default = MockEchoProvider for safety. Real callers (page, popup) pass
   * the provider they want — typically IntegralNativeProvider in production.
   */
  provider?: ChatProvider;
  /** Hide the surface header chrome (e.g. when embedded in a dialog). */
  showHeader?: boolean;
}

/**
 * Single-pane chat surface — runtime provider + thread viewport. No sidebar.
 * The floating launcher popup uses ``AIChatRuntimeBoundary`` directly with its
 * own conversations drawer; use this helper only when thread switching is
 * not needed.
 */
export function AIChatSurface({
  provider = MockEchoProvider,
  showHeader = true,
}: AIChatSurfaceProps) {
  return (
    <AIChatRuntimeBoundary provider={provider}>
      <AIChatThread providerLabel={provider.label} showHeader={showHeader} />
    </AIChatRuntimeBoundary>
  );
}

/**
 * Runtime provider boundary — exposes the assistant-ui runtime to any
 * child primitive (Thread, ThreadList, ToolUI, etc.). Use directly when you
 * need to compose multiple primitives (e.g. sidebar + panel) under one
 * shared runtime.
 */
export function AIChatRuntimeBoundary({
  provider,
  children,
  initialThreadId = null,
  startNewThread = false,
  handoffEnabled = true,
}: {
  provider: ChatProvider;
  children: ReactNode;
  /** Deep-link target from `/agent?thread=…`. */
  initialThreadId?: string | null;
  /** Open on the empty greeter instead of resuming the latest thread. */
  startNewThread?: boolean;
  handoffEnabled?: boolean;
}) {
  const { scope } = useScope();

  return (
    <ChatEntityRefsProvider>
      <AIChatRuntimeBoundaryInner
        key={scope?.workspaceId ?? "__unscoped__"}
        provider={provider}
        initialThreadId={initialThreadId}
        startNewThread={startNewThread}
        handoffEnabled={handoffEnabled}
      >
        {children}
      </AIChatRuntimeBoundaryInner>
    </ChatEntityRefsProvider>
  );
}

function AIChatRuntimeBoundaryInner({
  provider,
  children,
  initialThreadId = null,
  startNewThread = false,
  handoffEnabled = true,
}: {
  provider: ChatProvider;
  children: ReactNode;
  initialThreadId?: string | null;
  startNewThread?: boolean;
  handoffEnabled?: boolean;
}) {
  const navigate = useNavigate();
  const { consumePendingEntityRefs, resetComposerEntityRefs } =
    useChatEntityRefs();
  const {
    runtime,
    activityText,
    isRunning,
    streamError,
    appendAssistantNote,
    activeProviderSessionId,
    activeThreadId,
    composerReady,
    streamingThreadIds,
    remoteTurns,
    isThreadStreaming,
    threadGroups,
    threads,
  } = useAIChatRuntime(provider, {
    onNavigate: (path, threadId) => {
      requestOpenCompanionChat({ threadId });
      navigate(path);
    },
    consumeEntityRefs: consumePendingEntityRefs,
    resetComposerEntityRefs,
    initialThreadId,
    startNewThread,
    handoffEnabled,
  });
  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <ChatActivityContext.Provider
        value={{
          activityText,
          isRunning,
          streamError,
          appendAssistantNote,
          activeProviderSessionId,
          activeProviderId: provider.id,
          activeThreadId,
          composerReady,
          streamingThreadIds,
          remoteTurns,
          isThreadStreaming,
          threadGroups,
          threads,
        }}
      >
        {/* Staged-change approval cards render inline at the top of the
            assistant message via InlineStagedCards (Thread.tsx); the raw
            tool-call trace stays in the foldable "N tool calls" group via the
            default ToolFallback. No per-tool renderer registration needed. */}
        {children}
      </ChatActivityContext.Provider>
    </AssistantRuntimeProvider>
  );
}
