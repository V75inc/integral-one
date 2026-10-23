import { CollapsibleUserMessage } from './CollapsibleUserMessage';
import { ConversationModelPicker } from './ConversationModelPicker';
import { ExpandableChatError } from "./ExpandableChatError";
import { HoverTooltip } from '../../../components/ui/HoverTooltip';
import { KebabMenu } from '../../../components/ui/KebabMenu';
import './composer.css';
import { useChatEntityRefsOptional } from '../../../context/ChatEntityRefsContext';
import { PageMeta } from '../../../components/ui';
import {
  ActionBarMorePrimitive,
  ActionBarPrimitive,
  AttachmentPrimitive,
  AuiIf,
  ComposerPrimitive,
  ErrorPrimitive,
  MessagePrimitive,
  ThreadPrimitive,
  useAttachment,
  useAui,
  useAuiState,
} from "@assistant-ui/react";
import { useScopedSuggestions } from "../hooks/useScopedSuggestions";
import { Text } from "../../../ui";
import {
  ArrowDownIcon,
  BugIcon,
  CheckIcon,
  ChevronDownIcon,
  CopyIcon,
  DownloadIcon,
  ExternalLinkIcon,
  FileTextIcon,
  ImageIcon,
  MoreHorizontalIcon,
  PaperclipIcon,
  PencilIcon,
  RefreshCwIcon,
  Sparkles,
  SquareIcon,
  StopCircleIcon,
  XIcon,
} from "lucide-react";
import {
  type ReactNode,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { PartState } from "@assistant-ui/react";
import { useScope } from "../../../context/ScopeContext";
import { getComposerAccessory } from "../../../host/registry";
import { sanitizeMarkdownHref } from "../../../utils/safeHref";
import { useChatActivity } from "../AIChatSurface";
import { THREAD_ALREADY_RESPONDING } from "../threadSessionRegistry";
import { PromptSheetHost } from "../prompt-sheet/PromptSheet";
import {
  isPromptSheetResume,
  parsePromptSheetResume,
} from "../prompt-sheet/resumeDisplay";
import { useAgentiveCapability } from "../../settings/hooks/useAgentiveCapability";
import { normalizeEntityRefs } from "../../../components/chat/chatEntityTokens";
import { TaggedMessageContent } from "../../../components/chat/TaggedMessageContent";
import type { ChatEntityRef } from "../../../types/chatEntityRefs";
import { AuiTaggableComposer } from "./AuiTaggableComposer";
import { ComposerSendWithRefs } from "./ComposerSendWithRefs";
import { MarkdownText } from "./MarkdownText";
import { MarkdownContent } from "../../../components/ui/MarkdownContent";
import { ChatAttachmentList } from "./ChatAttachmentList";
import { extractAttachmentListsFromParts } from "./extractAttachmentListsFromParts";
import { MessageObservability, useMessageModelLabel, useMessageTurnMetrics } from "./MessageObservability";
import { MessageDebugDialog } from "./MessageDebugDialog";
import { Reasoning } from "./Reasoning";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "../../../components/ui/collapsible";
import { ToolFallback } from "./ToolFallback";
import { LogoMark } from "../../../components/ui/Logo";
import { MessageUndoActions } from "./MessageUndoActions";
import { ComposerAttachmentErrorToast } from "./ComposerAttachmentErrorToast";
import { ComposerMicButton } from "./ComposerMicButton";
import { ComposerDictationProvider } from "../../speech/ComposerDictationContext";
import { hasAssistantDebugPayload, isModelSetupFailure } from "./assistantMessagePresentation";
import { ModelSetupNotice } from "./ModelSetupNotice";
import {
  CHAT_SURFACE_ATTR,
  useTypeAnywhereComposer,
} from "./useTypeAnywhereComposer";

export interface AIChatThreadProps {
  providerLabel?: string;
  /** Hide the surface header (e.g. when embedded in a popup w/ its own chrome). */
  showHeader?: boolean;
}

/**
 * Full-feature chat surface — modeled on assistant-ui's reference Thread, skinned
 * in Integral tokens. Includes welcome screen, scroll-to-bottom, hover action
 * bars (copy / regenerate / edit), branch picker, edit composer, and chain-of-
 * thought grouping for reasoning + tool calls.
 */
export function AIChatThread({ providerLabel, showHeader = true }: AIChatThreadProps) {
  const { activeProviderId } = useChatActivity();
  // Stray keystrokes anywhere on this surface land in the composer. The
  // composer autoFocuses on mount, but any click on a message, a scroll
  // region or a dismissed popover moves focus off it and typing then went
  // nowhere. Scoped to this root so the dock and /agent can't both claim the
  // same keystroke.
  const rootRef = useRef<HTMLDivElement | null>(null);
  useTypeAnywhereComposer(rootRef);

  return (
    <ThreadPrimitive.Root
      ref={rootRef}
      {...{ [CHAT_SURFACE_ATTR]: "" }}
      /* `h-full` alone measures 100% of the PARENT and ignores siblings, so any
         element sharing the column pushed this past the container's bottom edge
         — the dock is `overflow-hidden`, so the composer was simply cut off.
         With the first-login onboarding strip present the panel overflowed by
         37px; dismissing the strip moved the composer back to a correct -16px.
         `flex-1 min-h-0` makes it absorb what is left instead of demanding the
         whole column.
         `h-full` stays for the block-parent case: AIChatPage renders this
         inside a plain `min-h-0 flex-1` div where there is no flex context and
         height:100% is what fills it. In a flex column, `flex-1`'s 0% basis
         wins over it, so one class list is correct in both. */
      className="@container flex h-full min-h-0 w-full flex-1 flex-col bg-[var(--section-bg)]"
      style={
        {
          ["--thread-max-width" as string]: "44rem",
        } as React.CSSProperties
      }
    >
      {showHeader && (
        <header
          className="
            flex items-center justify-between border-b border-[var(--border-subtle)]
            bg-[var(--panel)] px-4 py-2
          "
        >
          <div className="flex items-center gap-2">
            <Sparkles size={14} className="text-[var(--brand-accent)]" />
            <h2 className="text-sm font-medium text-[var(--text)]">Chat</h2>
          </div>
          {providerLabel && (
            <span
              className="
                rounded-[var(--radius-pill)] bg-[var(--badge-muted-bg)]
                px-2 py-0.5 text-[10px] uppercase tracking-wide text-[var(--badge-muted-fg)]
              "
            >
              {providerLabel}
            </span>
          )}
        </header>
      )}

      <ThreadPrimitive.Viewport
        turnAnchor="bottom"
        scrollToBottomOnThreadSwitch
        className="
          relative flex flex-1 flex-col overflow-x-hidden overflow-y-auto scroll-smooth bg-[var(--section-bg)]
          [scrollbar-color:var(--scrollbar-thumb)_transparent]
        "
      >
        {/* `pt-10` (not pt-6): the first bubble sat tight under the header,
            which reads as clipped when the transcript is scrolled to top. */}
        <div className="mx-auto flex w-full max-w-[var(--thread-max-width)] flex-1 flex-col px-4 pt-10">
          <AuiIf condition={(s) => s.thread.isEmpty}>
            <ThreadWelcome />
          </AuiIf>

          <div className="mb-10 flex flex-col gap-y-8 empty:hidden">
            <ThreadPrimitive.Messages>
              {() => <ThreadMessage />}
            </ThreadPrimitive.Messages>
            <ActivityStrip />
          </div>

          <ThreadPrimitive.ViewportFooter
            className="
              sticky bottom-0 mt-auto flex flex-col gap-3
              overflow-visible bg-[var(--section-bg)] pb-4 pt-2 md:pb-6
            "
          >
            <ThreadScrollToBottom />
            <PromptSheetHost>
              {({ composerLocked, canReplyInChat, sheet }) => (
                <>
                  {sheet}
                  <Composer
                    locked={
                      composerLocked &&
                      !(activeProviderId === 'integral_native' && canReplyInChat)
                    }
                  />
                </>
              )}
            </PromptSheetHost>
          </ThreadPrimitive.ViewportFooter>
        </div>
      </ThreadPrimitive.Viewport>
    </ThreadPrimitive.Root>
  );
}

// ---------------------------------------------------------------------------
// Welcome
// ---------------------------------------------------------------------------

function ThreadWelcome() {
  return (
    <div className="my-auto flex grow flex-col">
      <div className="flex w-full grow flex-col items-center justify-center">
        <div className="flex size-full flex-col justify-center px-4">
          <Text variant="heading-md" as="h1">
            What would you like to work on?
          </Text>
          <PageMeta as="p">
            Ask a question, find something, or work through an idea.
          </PageMeta>
        </div>
      </div>
      <ThreadSuggestions />
    </div>
  );
}

function ThreadSuggestions() {
  const suggestions = useScopedSuggestions();
  const aui = useAui();

  if (suggestions.length === 0) return null;

  return (
    <div className="grid w-full gap-2 pb-4 @md:grid-cols-2">
      {suggestions.map(s => (
        <button
          key={s.label}
          type="button"
          onClick={() => {
            // Prefill the composer — do NOT auto-send.
            aui.composer().setText(s.text);
          }}
          className="
            flex h-auto w-full flex-col items-start justify-start gap-1
            rounded-[var(--radius-card)] border border-[var(--panel-border)]
            bg-[var(--surface)] px-3 py-2.5
            text-left text-sm text-[var(--text)]
            transition-colors hover:border-[var(--text-subtle)]
            focus:outline-none focus:ring-2 focus:ring-[var(--focus-ring-color)]
          "
        >
          {s.label}
        </button>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Activity strip — humanized tool-progress / "thinking" indicator
// ---------------------------------------------------------------------------

/**
 * Renders a prominent indicator showing the agent's current activity
 * (e.g. "Filing your content…", or fallback "Thinking…") inline
 * with the message stream while a turn is in flight. Styled as a
 * pill that reads as a real progress affordance, not an
 * easy-to-miss whisper of italic text.
 *
 * Sourced from the runtime's activity-text channel, which the
 * backend translator populates from the cockpit's `tool_progress`
 * frames. The activity text updates AS new humanized statuses
 * arrive ("Thinking" → "Filing your content" → …) so when the
 * cockpit emits multiple tool_progress events, the user sees the
 * action evolve.
 *
 * Renders nothing when no turn is in progress so the chat stays
 * clean between turns — except for a stream error that never landed
 * on an assistant bubble (admission refusals). Turn failures that mark
 * the draft ``incomplete`` render once via ``MessageError``; this strip
 * must not echo them.
 */
export function ActivityStrip() {
  const { streamError } = useChatActivity();

  // "Already responding" is a busy check, not a failed turn. Admission /
  // capacity refusals still alert here because no assistant draft owns them.
  if (streamError && streamError !== THREAD_ALREADY_RESPONDING) {
    return (
      <div
        className="
          animate-in fade-in slide-in-from-bottom-1 duration-150
          flex items-center gap-2 px-2 py-1
          text-[12px] text-[var(--danger-fg)]
        "
        role="alert"
        aria-live="assertive"
        data-testid="chat-activity-strip"
      >
        <span className="inline-flex shrink-0" aria-hidden>⚠</span>
        <ExpandableChatError summary={streamError} className="min-w-0 flex-1" />
      </div>
    );
  }

  // The work trail on the running message is the live status.
  return null;
}

// ---------------------------------------------------------------------------
// Scroll-to-bottom
// ---------------------------------------------------------------------------

function ThreadScrollToBottom() {
  return (
    <ThreadPrimitive.ScrollToBottom
      aria-label="Scroll to bottom"
      className="
        absolute -top-12 z-10 self-center
        flex h-8 w-8 items-center justify-center rounded-full
        border border-[var(--panel-border)] bg-[var(--panel)]
        text-[var(--text-muted)] shadow-[var(--shadow-sm)]
        transition hover:bg-[var(--panel-2)] hover:text-[var(--text)]
        disabled:invisible
        focus:outline-none focus:ring-2 focus:ring-[var(--focus-ring-color)]
      "
    >
      <ArrowDownIcon size={14} />
    </ThreadPrimitive.ScrollToBottom>
  );
}

// ---------------------------------------------------------------------------
// Message dispatch
// ---------------------------------------------------------------------------

function ThreadMessage() {
  const role = useAuiState((s) => s.message.role);
  const isEditing = useAuiState((s) => s.message.composer.isEditing);
  if (isEditing) return <EditComposer />;
  if (role === "user") return <UserMessage />;
  return <AssistantMessage />;
}

function clipStatus(text: string): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= 72) return clean;
  return `${clean.slice(0, 71).trimEnd()}…`;
}

/** One line for a closed trail while the turn is still running. */
export function liveWorkSynopsis(
  activity: string | undefined,
  latestTool: string | undefined,
  completedTools = 0,
  hasAnswerText = false,
): string {
  const activityLine = activity?.replace(/\s+/g, " ").trim();
  if (activityLine && !/^(working(?: on that for you)?|thinking|responding)[.…]*$/i.test(activityLine)) return clipStatus(activityLine);
  if (latestTool?.trim()) return toolWorkSynopsis(latestTool);
  if (hasAnswerText) return "Responding…";
  if (completedTools > 0) return "Reviewing the results";
  return "Responding…";
}

/** Describe observable operations, never model reasoning or tool arguments. */
function toolWorkSynopsis(name: string): string {
  if (name === "integral_call_workspace_tool") return "Working in your App";
  if (name === "integral_get_index_status") return "Checking search readiness";
  if (name === "integral_reindex_track") return "Preparing a search refresh for review";
  if (name === "integral_configure_search_index") return "Preparing search settings for review";
  if (name === "integral_get_page_context" || name === "integral_get_scope") return "Checking your workspace";
  if (/^(search_capabilities|load_capability|load_skill|search_tools)$/.test(name)) return "Finding the right way to help";
  if (/query|search|retrieve|find/.test(name)) return "Finding relevant information";
  if (/list|describe|inspect|get|read/.test(name)) return "Reading the information you can access";
  if (/verify|validate|check/.test(name)) return "Checking the results";
  if (/create|update|delete|remove|configure|propose|build/.test(name)) return "Preparing your changes";
  return "Working on the next step";
}

export function latestActiveTool(parts: readonly {
  type: string; toolName?: string; result?: unknown; status?: { type?: string };
}[]): string {
  return [...parts].reverse().find((part) =>
    part.type === "tool-call" && part.result === undefined &&
    part.status?.type !== "complete" && part.status?.type !== "incomplete",
  )?.toolName ?? "";
}

/**
 * One trail for reasoning and tool steps.
 *
 * Stays collapsed. While the turn runs the label is a one-line status.
 * When the reply lands it shows completion, tools, model, duration and tokens. Expanding retraces the
 * activity and the steps. A manual expansion survives completion.
 */
export function WorkTrail({ children }: { children: ReactNode }) {
  const running = useAuiState((s) => s.message.status?.type === "running");
  const interruptedReason = useAuiState((s) =>
    s.message.status?.type === "incomplete" ? s.message.status.reason : undefined,
  );
  const { activityText } = useChatActivity();
  const statusLabel = useAuiState(
    (s) =>
      (s.message.metadata?.custom as { statusLabel?: string } | undefined)
        ?.statusLabel,
  );
  const setupNeeded = useAuiState((s) => isModelSetupFailure(
    (s.message.metadata?.custom as { errorCode?: string } | undefined)?.errorCode,
  ));
  const modelLabel = useMessageModelLabel();
  const turnMetrics = useMessageTurnMetrics();
  const toolCount = useAuiState(
    (s) => (s.message.parts ?? []).filter((p) => p.type === "tool-call").length,
  );
  const latestTool = useAuiState((s) => latestActiveTool(s.message.parts ?? []));
  const hasAnswerText = useAuiState((s) =>
    (s.message.parts ?? []).some((p) => p.type === "text" && Boolean(p.text?.trim())),
  );
  const toolFailed = useAuiState((s) =>
    (s.message.parts ?? []).some((p) => {
      if (p.type !== "tool-call") return false;
      const status = (p as { status?: { type?: string; reason?: string } }).status;
      return status?.type === "incomplete" && status.reason === "error";
    }),
  );
  const [open, setOpen] = useState(false);

  const live = liveWorkSynopsis(
    activityText ?? statusLabel,
    latestTool,
    latestTool ? 0 : toolCount,
    hasAnswerText,
  );
  const done = [
    setupNeeded ? "Setup needed" : interruptedReason === "cancelled" ? "Stopped" : interruptedReason ? "Interrupted" : "Finished",
    toolCount > 0 ? `${toolCount} ${toolCount === 1 ? "tool call" : "tool calls"}` : "",
    modelLabel,
    turnMetrics,
    toolFailed ? "a step failed" : "",
  ]
    .filter(Boolean)
    .join(" · ");
  const label = running ? live : done;

  return (
    <Collapsible
      open={open}
      onOpenChange={setOpen}
      data-slot="aui_work-trail"
      className="mt-4 mb-3 min-w-0 max-w-full"
    >
      <CollapsibleTrigger
        title="Show activity, timing, token usage, and cost when available"
        className="
          flex w-full min-w-0 items-center gap-1.5 py-0.5 text-left text-[12px]
          text-[var(--text-muted)] transition-colors hover:text-[var(--text)]
        "
      >
        <ChevronDownIcon
          size={13}
          className={`shrink-0 transition-transform duration-200 motion-reduce:transition-none ${open ? "rotate-0" : "-rotate-90"}`}
        />
        {/* Optical alignment with the font's visible letters, above its descender space. */}
        <span aria-hidden="true" className="relative -top-px inline-flex h-4 w-4 shrink-0 items-center justify-center leading-none">
          <span className={`inline-flex items-center justify-center ${running ? "animate-agent-working motion-reduce:animate-none" : ""}`}><LogoMark size="xs" /></span>
        </span>
        <span role="status" aria-live="polite" title={label} className="inline-flex min-h-4 min-w-0 items-center leading-4"><span key={label} className="break-words animate-status-reveal motion-reduce:animate-none">{label}</span></span>
      </CollapsibleTrigger>
      <CollapsibleContent className="mt-2 flex max-h-80 min-w-0 max-w-full flex-col gap-3 overflow-y-auto pl-5 text-xs">
        <p className="text-xs text-[var(--text-muted)]">Activity, tool results, and model usage are shown here.</p>
        <MessageObservability />
        {children}
      </CollapsibleContent>
    </Collapsible>
  );
}

// ---------------------------------------------------------------------------
// Assistant message
// ---------------------------------------------------------------------------

/** Stable `groupBy` for {@link MessagePrimitive.GroupedParts} (0.14+ API). */
const assistantMessageGroupBy = (part: PartState) => {
  if (part.type === "reasoning") {
    return ["group-chainOfThought", "group-reasoning"] as const;
  }
  if (part.type === "tool-call") {
    return ["group-chainOfThought", "group-tool"] as const;
  }
  return null;
};

// Scheduled-routine runs post into the same thread as live turns (see
// backend `POST /chat/threads/{id}/agent-turn?origin=routine_task` —
// routine_task_scheduler.py). Badge them distinctly so a proactive run
// doesn't read as something the user asked for in this session.
function RoutineRunBadge() {
  const origin = useAuiState(
    (s) =>
      (
        s.message.metadata?.custom as {
          interactPayload?: { origin?: string };
        }
      )?.interactPayload?.origin,
  );
  if (origin !== "routine_task") return null;
  return (
    <div
      data-slot="aui_routine-run-badge"
      className="mb-1 inline-flex items-center gap-1 rounded-full bg-[var(--surface-2)] px-2 py-0.5 text-[11px] font-medium text-[var(--text-muted)]"
    >
      <span aria-hidden="true">{"🕐"}</span>
      Scheduled routine
    </div>
  );
}

function AssistantMessage() {
  const isRunning = useAuiState((s) => s.message.status?.type === "running");
  const isCancelled = useAuiState(
    (s) => s.message.status?.type === "incomplete" && s.message.status.reason === "cancelled",
  );
  // Empty boundary artifacts stay action-free. Metadata-only final payloads
  // retain a debug-only action so diagnostics remain reachable without
  // rendering copy/regenerate controls for blank text.
  const hasVisibleBody = useAuiState((s) => {
    const parts = s.message.parts ?? [];
    return parts.some((p) => {
      if (p.type === "text") return Boolean((p as { text?: string }).text?.trim());
      if (p.type === "reasoning")
        return Boolean((p as { text?: string }).text?.trim());
      if (p.type === "tool-call") return true;
      if (p.type === "source") return true;
      return false;
    });
  });
  const hasDebugPayload = useAuiState((s) =>
    hasAssistantDebugPayload(s.message.metadata?.custom),
  );
  const messageText = useAuiState((s) =>
    (s.message.parts ?? [])
      .filter((part) => part.type === "text")
      .map((part) => (part as { text?: string }).text ?? "")
      .join(""),
  );
  if (!isRunning && isPromptSheetResume(messageText)) {
    return (
      <MessagePrimitive.Root data-role="assistant" data-prompt-sheet-resume="true">
        <PromptSheetResumeNote text={messageText} />
      </MessagePrimitive.Root>
    );
  }
  // Reserve action-bar height (min-h + pt) so the row holds its space even
  // while the bar is hidden during streaming. NO negative bottom margin: the
  // bar is now always visible (not hover-revealed), so there's no collapse to
  // compensate, and -mb would pull the next message up over the icons.
  const ACTION_BAR_RESERVE = "min-h-7 pt-1.5";

  const renderParts = (activityOnly: boolean) => (
    <MessagePrimitive.GroupedParts groupBy={assistantMessageGroupBy}>
      {({ part, children }) => {
        if ("indices" in part) {
          if (!activityOnly) return null;
          switch (part.type) {
            case "group-chainOfThought":
              return activityOnly ? <>{children}</> : null;
            case "group-reasoning":
              return (
                <div className="flex max-h-64 flex-col gap-1 overflow-y-auto text-xs text-[var(--text-muted)]">
                  <div className="text-[11px] font-medium text-[var(--text-subtle)]">
                    Thinking
                  </div>
                  {children}
                </div>
              );
            case "group-tool":
              return (
                <div className="flex flex-col gap-2">
                  <div className="text-[11px] font-medium text-[var(--text-subtle)]">
                    Steps
                  </div>
                  {children}
                </div>
              );
            default:
              return null;
          }
        }
        if (activityOnly !== (part.type === "reasoning" || part.type === "tool-call")) return null;
        switch (part.type) {
          case "text":
            // Smooth-streamed assistant answer. `MarkdownText` reads the
            // live part from assistant-ui context and interpolates it
            // character-by-character (with the streaming dot from dot.css),
            // so the answer types in instead of re-rendering whole chunks.
            return (
              <div className="my-1.5 first:mt-0 last:mb-0">
                <MarkdownText />
              </div>
            );
          case "reasoning":
            // Live thinking stream — rendered by the ported Reasoning
            // component (smooth markdown body that tails the stream),
            // grouped under the work trail's Thinking section.
            return <Reasoning {...part} />;
          case "tool-call":
            return part.toolUI ?? <ToolFallback {...part} />;
          case "source":
            return (
              <SourceView
                part={part as { url?: string; title?: string }}
              />
            );
          default:
            return null;
        }
      }}
    </MessagePrimitive.GroupedParts>
  );

  return (
    <MessagePrimitive.Root
      data-role="assistant"
      className="
        relative animate-in fade-in slide-in-from-bottom-1 duration-150
      "
    >
      <div className="[overflow-wrap:anywhere] px-2 leading-relaxed text-[var(--text)]">
        <RoutineRunBadge />
        {renderParts(false)}
        {isCancelled && (
          <div role="status" className="my-2 flex items-center gap-2 text-xs text-[var(--text-muted)]">
            <StopCircleIcon aria-hidden="true" className="size-3.5 shrink-0" />
            <span>You stopped this request.</span>
          </div>
        )}
        {/* Prompt Sheet (composer) owns live sequester for questions +
            staged writes. Inline attachment lists stay as transcript
            artifacts when already in message parts. */}
        <InlineAttachmentLists />
        <MessageError />
        <WorkTrail>{renderParts(true)}</WorkTrail>
      </div>

      {(hasVisibleBody || hasDebugPayload || isRunning) && (
        <div className={`ms-2 flex items-center ${ACTION_BAR_RESERVE}`}>
          <AssistantActionBar debugOnly={!hasVisibleBody} />
        </div>
      )}
    </MessagePrimitive.Root>
  );
}

/** Host approval receipts share one quiet presentation across transcript roles. */
export function PromptSheetResumeNote({ text }: { text: string }) {
  const view = parsePromptSheetResume(text);
  return (
    <div role="status" className="mx-2 my-3 max-w-xl space-y-1.5">
      <Text as="p" variant="body" weight="medium">{view.title}</Text>
      {view.items.length > 0 && (
        <ul className="list-disc space-y-1 pl-4">
          {view.items.map((item, index) => (
            <li key={`${index}:${item}`}>
              <MarkdownContent compact>{item}</MarkdownContent>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Source view (standalone source part)
// ---------------------------------------------------------------------------

export function SourceView({ part }: { part: { url?: string; title?: string } }) {
  if (!part.url) return null;
  // Source URLs come from the model / tool results, so they get the same
  // scheme allow-list as markdown links: a `javascript:` or `data:` source
  // renders as inert text instead of a clickable anchor.
  const href = sanitizeMarkdownHref(part.url);
  const label = <span className="truncate max-w-48">{part.title || part.url}</span>;
  if (!href) {
    return (
      <span
        data-testid="chat-source-unsafe"
        className="
          inline-flex items-center gap-1.5 rounded-[var(--radius-input)]
          border border-[var(--border-subtle)] bg-[var(--panel)]
          px-2.5 py-1 text-xs text-[var(--text-muted)]
        "
      >
        <ExternalLinkIcon size={12} />
        {label}
      </span>
    );
  }
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="
        inline-flex items-center gap-1.5 rounded-[var(--radius-input)]
        border border-[var(--border-subtle)] bg-[var(--panel)]
        px-2.5 py-1 text-xs text-[var(--brand-accent)]
        hover:bg-[var(--panel-2)] transition
      "
    >
      <ExternalLinkIcon size={12} />
      {label}
    </a>
  );
}

/**
 * Renders attachment lists the agent delivered via ``integral_list_attachments``
 * (tool result ``_kind: "attachment_list"``). Scan the message's tool-call
 * parts, coerce the JSON result, and render a deliverable list with working
 * download links.
 */
function InlineAttachmentLists() {
  const content = useAuiState((s) => s.message.content);
  const parts = useAuiState((s) => s.message.parts);
  const lists = useMemo(
    () => extractAttachmentListsFromParts(content, parts),
    [content, parts],
  );
  if (lists.length === 0) return null;
  return (
    <div className="mb-3 flex flex-col gap-2">
      {lists.map((l) => (
        <ChatAttachmentList
          key={l.key}
          attachments={l.attachments}
          scopeLabel={l.scope}
        />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Error
// ---------------------------------------------------------------------------

function MessageError() {
  const detail = useAuiState((s) =>
    (s.message.metadata?.custom as { errorDetail?: string } | undefined)?.errorDetail,
  );
  const code = useAuiState((s) =>
    (s.message.metadata?.custom as { errorCode?: string } | undefined)?.errorCode,
  );
  if (isModelSetupFailure(code)) {
    return <MessagePrimitive.Error><ModelSetupNotice code={code} /></MessagePrimitive.Error>;
  }
  return (
    <MessagePrimitive.Error>
      <ErrorPrimitive.Root
        className="
          chat-message-error mt-2 rounded-[var(--radius-card)] border border-[var(--chat-error-border)]
          bg-[var(--chat-error-bg)] p-3 text-sm text-[var(--chat-error-fg)]
        "
      >
        <ExpandableChatError summary={<ErrorPrimitive.Message />}>
          {detail || <ErrorPrimitive.Message />}
        </ExpandableChatError>
      </ErrorPrimitive.Root>
    </MessagePrimitive.Error>
  );
}

// ---------------------------------------------------------------------------
// Assistant action bar (copy / regenerate / more)
// ---------------------------------------------------------------------------

function AssistantActionBar({ debugOnly = false }: { debugOnly?: boolean }) {
  const [payloadOpen, setPayloadOpen] = useState(false);
  // Track menu open state independently so the "..." button stays mounted
  // even when ActionBarPrimitive.Root autohides (see bug fix below).
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);

  const interactPayload = useAuiState(
    (s) =>
      (s.message.metadata?.custom as { interactPayload?: Record<string, unknown> })
        ?.interactPayload,
  );
  const steps = useAuiState(
    (s) => (s.message.metadata?.custom as { steps?: unknown[] })?.steps,
  );
  const timing = useAuiState((s) => s.message.metadata?.timing);
  // The assembled assistant message IS the server's response (native provider streams
  // it back as deltas which the runtime accumulates into these parts).
  const responseContent = useAuiState((s) => s.message.content);
  const responseStatus = useAuiState((s) => s.message.status);
  // Authoritative final answer captured at end-of-stream (native provider `final`
  // chunk). `finalContent` = the settled answer text; `finalPayload` = the full
  // final chunk. This is jvchat's `debugData` equivalent — the debug view's
  // source-of-truth when present.
  const finalContent = useAuiState(
    (s) =>
      (s.message.metadata?.custom as { finalContent?: string })?.finalContent,
  );
  const finalPayload = useAuiState(
    (s) =>
      (s.message.metadata?.custom as { finalPayload?: Record<string, unknown> })
        ?.finalPayload,
  );

  // The action bar is always visible (no hover autohide) — only hidden while
  // the thread is running. The "..." menu mirrors that single condition so the
  // two halves of the bar appear/disappear together. (The old hover-gated
  // autohide shifted content on reveal and could leave the dropdown orphaned:
  // moving the cursor onto the open menu cleared `isHovering`, unmounting the
  // copy/reload/debug icons while the kebab + dropdown lingered.)
  const showMoreMenu = useAuiState((s) => !debugOnly && !s.thread.isRunning);

  // Debug mirrors jvchat's two-panel dialog, sourced from the authoritative
  // final chunk (jvchat reads `debugData.interaction.response` + the whole
  // `debugData`).
  //
  // Panel 1 ("Message Content") = the settled final answer (`finalContent`),
  // falling back to the assembled streamed text for turns persisted before
  // final-content capture existed.
  const assembledText = Array.isArray(responseContent)
    ? (responseContent as Array<{ type?: string; text?: string }>)
        .filter((p) => p.type === "text")
        .map((p) => p.text ?? "")
        .join("")
    : "";
  const messageContent = finalContent ?? assembledText;
  // Panel 2 ("Diagnostic payload") uses the final chunk from the server
  // (`finalPayload`). Fall back to a reconstruction (assembled response +
  // steps/timing + request) for pre-capture turns.
  const fullPayload: Record<string, unknown> | null = finalPayload
    ? finalPayload
    : responseContent
      ? {
          response: {
            content: responseContent,
            ...(responseStatus ? { status: responseStatus } : undefined),
            ...(steps ? { steps } : undefined),
            ...(timing ? { timing } : undefined),
          },
          ...(interactPayload ? { request: interactPayload } : undefined),
        }
      : null;

  return (
    <>
      {/* Always-visible action bar (no hover autohide — it shifted content on
          reveal and orphaned the dropdown). Hidden only while running. */}
      <ActionBarPrimitive.Root
        hideWhenRunning
        className="-ms-1 flex gap-0.5 text-[var(--text-subtle)]"
      >
        {!debugOnly && (
          <>
            <ActionBarPrimitive.Copy
              aria-label="Copy"
              className="
                flex h-7 w-7 items-center justify-center rounded-[var(--radius-input)]
                hover:bg-[var(--panel-2)] hover:text-[var(--text)]
                transition focus:outline-none focus:ring-2 focus:ring-[var(--focus-ring-color)]
              "
            >
              <AuiIf condition={(s) => s.message.isCopied}>
                <CheckIcon size={14} />
              </AuiIf>
              <AuiIf condition={(s) => !s.message.isCopied}>
                <CopyIcon size={14} />
              </AuiIf>
            </ActionBarPrimitive.Copy>
            <ActionBarPrimitive.Reload
              aria-label="Regenerate"
              className="
                flex h-7 w-7 items-center justify-center rounded-[var(--radius-input)]
                hover:bg-[var(--panel-2)] hover:text-[var(--text)]
                transition focus:outline-none focus:ring-2 focus:ring-[var(--focus-ring-color)]
              "
            >
              <RefreshCwIcon size={14} />
            </ActionBarPrimitive.Reload>
            <MessageUndoActions />
          </>
        )}
        {/* Debug: a dedicated Bug icon button (jvchat's MessageDebugAction
            pattern) — not buried in the "..." menu. Hidden when the message
            has no debug payload yet. */}
        {fullPayload && (
          <button
            type="button"
            aria-label="Message debug"
            title="Message debug"
            onClick={() => setPayloadOpen(true)}
            className="
              flex h-7 w-7 items-center justify-center rounded-[var(--radius-input)]
              hover:bg-[var(--panel-2)] hover:text-[var(--text)]
              transition focus:outline-none focus:ring-2 focus:ring-[var(--focus-ring-color)]
            "
          >
            <BugIcon size={14} />
          </button>
        )}
      </ActionBarPrimitive.Root>
      {/*
        "..." menu lives OUTSIDE ActionBarPrimitive.Root so autohide cannot
        unmount the DropdownMenu.Root mid-interaction. Visibility is driven by
        the same logic (hover || isLast || menu open) via useAuiState above.
      */}
      {showMoreMenu && (
        <ActionBarMorePrimitive.Root
          open={moreMenuOpen}
          onOpenChange={setMoreMenuOpen}
        >
          <ActionBarMorePrimitive.Trigger
            aria-label="More"
            className="
              flex h-7 w-7 items-center justify-center rounded-[var(--radius-input)]
              hover:bg-[var(--panel-2)] hover:text-[var(--text)]
              data-[state=open]:bg-[var(--panel-2)] data-[state=open]:text-[var(--text)]
              transition focus:outline-none focus:ring-2 focus:ring-[var(--focus-ring-color)]
              text-[var(--text-subtle)]
            "
          >
            <MoreHorizontalIcon size={14} />
          </ActionBarMorePrimitive.Trigger>
          <ActionBarMorePrimitive.Content
            side="bottom"
            align="start"
            className={`
              z-popover min-w-32 overflow-hidden rounded-[var(--radius-input)]
              border border-[var(--panel-border)] bg-[var(--panel)] p-1
              text-sm text-[var(--text)] shadow-[var(--shadow-pop)]
            `}
          >
            <ActionBarPrimitive.ExportMarkdown asChild>
              <ActionBarMorePrimitive.Item
                className="
                  flex cursor-pointer select-none items-center gap-2
                  rounded-[var(--radius-input)] px-2 py-1.5
                  outline-none hover:bg-[var(--panel-2)]
                  focus:bg-[var(--panel-2)]
                "
              >
                <DownloadIcon size={14} />
                Export as Markdown
              </ActionBarMorePrimitive.Item>
            </ActionBarPrimitive.ExportMarkdown>
          </ActionBarMorePrimitive.Content>
        </ActionBarMorePrimitive.Root>
      )}
      {payloadOpen && fullPayload && (
        <MessageDebugDialog
          messageContent={messageContent}
          payload={fullPayload}
          onClose={() => setPayloadOpen(false)}
        />
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// User message
// ---------------------------------------------------------------------------

function entityRefsFromMetadata(
  metadata: { custom?: Record<string, unknown> } | undefined,
): ChatEntityRef[] {
  const raw = metadata?.custom?.entityRefs;
  return Array.isArray(raw) ? normalizeEntityRefs(raw as ChatEntityRef[]) : [];
}

/** assistant-ui's default `File` part component renders nothing — show the
 *  filename so a sent file attachment isn't invisible in the transcript. */
function SentFileChip({ filename }: { filename?: string }) {
  return (
    <span
      className="
        mb-1 inline-flex items-center gap-1.5 rounded-[var(--radius-input)]
        border border-[var(--border-subtle)] bg-[var(--panel-2)]
        px-2 py-1 text-xs text-[var(--text)]
      "
    >
      <PaperclipIcon size={12} />
      <span className="truncate">{filename || "Attached file"}</span>
    </span>
  );
}

/** Renders user-sent image attachments with thumbnail styling and click-to-preview. */
function SentImagePreview({
  image,
  data,
  contentType,
  alt = "Uploaded image",
}: {
  image?: string;
  data?: string;
  contentType?: string;
  alt?: string;
}) {
  const [modalOpen, setModalOpen] = useState(false);
  const src =
    image ||
    (data
      ? data.startsWith("data:")
        ? data
        : `data:${contentType || "image/png"};base64,${data}`
      : undefined);

  if (!src) return null;

  return (
    <>
      <div className="my-1.5 overflow-hidden rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-2)] shadow-sm max-w-sm">
        <img
          src={src}
          alt={alt}
          onClick={() => setModalOpen(true)}
          className="max-h-60 max-w-full object-contain cursor-pointer transition-transform hover:scale-[1.01]"
        />
      </div>
      {modalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-xs"
          onClick={() => setModalOpen(false)}
        >
          <div className="relative max-h-[90vh] max-w-[90vw]">
            <img
              src={src}
              alt={alt}
              className="max-h-[90vh] max-w-[90vw] rounded-lg object-contain"
            />
            <button
              type="button"
              onClick={() => setModalOpen(false)}
              className="absolute top-2 right-2 rounded-full bg-black/60 p-1.5 text-white hover:bg-black/80"
              aria-label="Close image preview"
            >
              <XIcon size={16} />
            </button>
          </div>
        </div>
      )}
    </>
  );
}

function UserMessageParts() {
  const parts = useAuiState((s) => s.message.content) as
    | ReadonlyArray<{
        type?: string;
        text?: string;
        image?: string;
        data?: string;
        content_type?: string;
        contentType?: string;
        filename?: string;
      }>
    | undefined;
  const metadata = useAuiState(
    (s) => s.message.metadata as { custom?: Record<string, unknown> } | undefined,
  );
  const text = (parts ?? [])
    .map((p) => (p.type === "text" ? p.text ?? "" : ""))
    .join("");

  const imageParts = (parts ?? []).filter((p) => p.type === "image");
  const fileParts = (parts ?? []).filter((p) => p.type === "file");

  if (isPromptSheetResume(text)) {
    return <PromptSheetResumeNote text={text} />;
  }

  return (
    <div className="flex flex-col gap-1.5">
      {fileParts.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {fileParts.map((f, i) => (
            <SentFileChip key={`file-${i}`} filename={f.filename} />
          ))}
        </div>
      )}

      {imageParts.length > 0 && (
        <div className="flex flex-col gap-2">
          {imageParts.map((img, i) => (
            <SentImagePreview
              key={`img-${i}`}
              image={img.image}
              data={img.data}
              contentType={img.content_type || img.contentType}
            />
          ))}
        </div>
      )}

      {text.trim() ? (
        <CollapsibleUserMessage>
          <TaggedMessageContent
            text={text}
            entityRefs={entityRefsFromMetadata(metadata)}
            className="text-sm leading-relaxed"
          />
        </CollapsibleUserMessage>
      ) : null}
    </div>
  );
}

function UserMessage() {
  const parts = useAuiState((s) => s.message.content) as
    | ReadonlyArray<{ type?: string; text?: string }>
    | undefined;
  const text = (parts ?? [])
    .map((p) => (p.type === "text" ? p.text ?? "" : ""))
    .join("");
  const quiet = isPromptSheetResume(text);

  if (quiet) {
    return (
      <MessagePrimitive.Root
        data-role="user"
        data-prompt-sheet-resume="true"
        className="flex justify-center px-2 pt-6"
      >
        <div
          className="
            w-full max-w-[min(36rem,100%)] rounded-[var(--radius-card)]
            border border-[var(--border-subtle)] bg-[var(--panel-2)]
            px-3.5 py-2.5
          "
        >
          <UserMessageParts />
        </div>
      </MessagePrimitive.Root>
    );
  }

  return (
    <MessagePrimitive.Root
      data-role="user"
      /* Keep the turn boundary spacious; viewport following is owned by
         assistant-ui's bottom anchor and respects manual scroll-up. */
      className="
        grid auto-rows-auto grid-cols-[minmax(72px,1fr)_auto]
        content-start gap-y-2 px-2 pt-8
        animate-in fade-in slide-in-from-bottom-1 duration-150
        [&:where(>*)]:col-start-2
      "
    >
      <div className="relative col-start-2 min-w-0">
        <div
          className="
            chat-user-message-bubble [overflow-wrap:anywhere] peer rounded-2xl
            bg-[var(--chat-user-bg)]
            border border-[var(--chat-user-border)]
            border-t-[3px] border-t-[var(--chat-user-accent)]
            px-4 py-2.5 text-[var(--text)]
            empty:hidden
          "
        >
          <UserMessageParts />
        </div>
        <div
          className="
            absolute start-0 top-1/2 -translate-x-full -translate-y-1/2 pe-2
            peer-empty:hidden
          "
        >
          <UserActionBar />
        </div>
      </div>
    </MessagePrimitive.Root>
  );
}

function UserActionBar() {
  return (
    <ActionBarPrimitive.Root
      hideWhenRunning
      autohide="not-last"
      className="flex flex-col items-end"
    >
      <ActionBarPrimitive.Edit
        aria-label="Edit"
        className="
          flex h-7 w-7 items-center justify-center rounded-[var(--radius-input)]
          text-[var(--text-subtle)]
          hover:bg-[var(--panel-2)] hover:text-[var(--text)]
          transition focus:outline-none focus:ring-2 focus:ring-[var(--focus-ring-color)]
        "
      >
        <PencilIcon size={14} />
      </ActionBarPrimitive.Edit>
    </ActionBarPrimitive.Root>
  );
}

// ---------------------------------------------------------------------------
// Edit composer (replaces user msg in-place when editing)
// ---------------------------------------------------------------------------

function EditComposer() {
  return (
    <MessagePrimitive.Root className="flex flex-col px-2">
      <ComposerPrimitive.Root
        className="
          ms-auto flex w-full max-w-[85%] flex-col rounded-2xl
          bg-[var(--chat-edit-bg)] border border-[var(--chat-edit-border)]
          border-t-[3px] border-t-[var(--chat-user-accent)]
        "
      >
        <ComposerPrimitive.Input
          autoFocus
          /* Read by useTypeAnywhereComposer: while an edit is open, stray
             keystrokes must NOT be routed to the send box at the bottom —
             mid-edit, "type anywhere" would silently start drafting a NEW
             message out of view. The label is the router's signal to stand
             down (and the accessible name AT reads out). */
          aria-label="Edit message"
          className="
            min-h-14 w-full resize-none bg-transparent p-4
            text-sm text-[var(--text)] outline-none
          "
        />
        <div className="mx-3 mb-3 flex items-center gap-2 self-end">
          <ComposerPrimitive.Cancel
            className="
              rounded-[var(--radius-input)] px-3 py-1 text-xs
              text-[var(--text-muted)] hover:bg-[var(--panel)] transition
            "
          >
            Cancel
          </ComposerPrimitive.Cancel>
          <ComposerPrimitive.Send
            className="
              rounded-[var(--radius-input)] bg-[var(--cta-bg)] px-3 py-1
              text-xs text-[var(--cta-fg)] hover:bg-[var(--cta-hover)] transition
            "
          >
            Update
          </ComposerPrimitive.Send>
        </div>
      </ComposerPrimitive.Root>
    </MessagePrimitive.Root>
  );
}

// The host restores one canonical transcript, not persisted message branches.
// Do not expose assistant-ui's transient repository branches as saved versions.

// ---------------------------------------------------------------------------
// Composer (sticky in viewport footer)
// ---------------------------------------------------------------------------

function ComposerHostAccessory() {
  const Hint = getComposerAccessory();
  const { scope } = useScope();
  const workspaceId = scope?.workspaceId;
  if (!Hint || !workspaceId) return null;
  return <Hint workspaceId={workspaceId} />;
}

export function Composer({ locked = false, home = false, onSendAttempt }: { locked?: boolean; home?: boolean; onSendAttempt?: () => void }) {
  const { blockedReason } = useAgentiveCapability();
  const { composerReady = true } = useChatActivity();

  if (!composerReady) {
    return <div role="status" className="px-3 py-3 text-sm text-[var(--text-muted)]">Loading conversation…</div>;
  }

  if (isModelSetupFailure(blockedReason)) {
    return <ModelSetupNotice code={blockedReason} />;
  }

  if (locked) {
    return (
      <div
        className="
          flex w-full items-center justify-center rounded-[var(--radius-card)]
          border border-dashed border-[var(--border-subtle)] bg-[var(--panel)]
          px-3 py-3 text-sm text-[var(--text-muted)]
        "
        data-composer-locked="true"
      >
        Resolve or cancel the prompts above to continue chatting.
      </div>
    );
  }

  return (
    <>
      <ComposerHostAccessory />
      <ComposerPrimitive.Root
      className="
        relative flex min-w-0 w-full flex-col
      "
    >
      <ComposerAttachmentErrorToast />
      <ComposerDictationProvider>
        <div
          className="
            chat-composer flex min-w-0 w-full flex-col gap-2 rounded-[var(--radius-card)]
            border border-[var(--border-subtle)] bg-[var(--panel)] p-2 home-chat-composer
            transition-[border-color,box-shadow] duration-fast
            focus-within:border-[var(--brand-accent-line)]
            focus-within:shadow-[0_0_0_3px_var(--focus-ring-color)]
          "
        >
          <div className="flex flex-wrap gap-2 px-2 empty:hidden">
            <ComposerPrimitive.Attachments
              components={{
                Image: AttachmentChip,
                Document: AttachmentChip,
                File: AttachmentChip,
                Attachment: AttachmentChip,
              }}
            />
          </div>
          <AuiTaggableComposer
            autoFocus={!home}
            rows={2}
            placeholder={home ? "Tell Integral what you need…" : "Ask Integral…"}
            aria-label={home ? "Draft for Integral AI" : "Message input"}
            acceptHandoff={!home}
            onSendAttempt={onSendAttempt}
            className="
              block w-full resize-none bg-transparent
              px-2 py-1.5 text-sm leading-5 text-[var(--text)]
              placeholder:text-[var(--text-subtle)]
              outline-none focus:outline-none
            "
          />
          <ComposerAction home={home} />
        </div>
        <Text as="p" variant="meta" tone="subtle" className="px-2 pt-1">
          Use @ for people · # for Apps and Tracks
        </Text>
      </ComposerDictationProvider>
    </ComposerPrimitive.Root>
    </>
  );
}

/** Custom thumbnail / icon renderer for composer attachment chips.
 *  Renders an image thumbnail if an image file is attached (using a local object URL),
 *  or clean Lucide icons (file text / paperclip) for documents and other files. */
function AttachmentThumbnail() {
  const attachment = useAttachment();
  const file = attachment?.file;
  const isImage =
    attachment?.type === "image" ||
    Boolean(file?.type?.startsWith("image/")) ||
    Boolean(attachment?.contentType?.startsWith("image/"));

  const [thumbUrl, setThumbUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!file || !isImage) {
      setThumbUrl(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setThumbUrl(url);
    return () => {
      URL.revokeObjectURL(url);
    };
  }, [file, isImage]);

  if (isImage) {
    if (thumbUrl) {
      return (
        <img
          src={thumbUrl}
          alt={attachment?.name || "Image attachment"}
          className="h-7 w-7 shrink-0 rounded object-cover border border-[var(--border-subtle)]"
        />
      );
    }
    return (
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded bg-blue-500/10 text-blue-500">
        <ImageIcon size={14} />
      </span>
    );
  }

  const isDoc =
    attachment?.type === "document" ||
    Boolean(file?.type?.includes("pdf")) ||
    Boolean(file?.type?.includes("text")) ||
    Boolean(file?.type?.includes("word")) ||
    Boolean(file?.type?.includes("document"));

  if (isDoc) {
    return (
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded bg-[var(--surface-2)] text-[var(--text-muted)]">
        <FileTextIcon size={14} />
      </span>
    );
  }

  return (
    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded bg-[var(--surface-2)] text-[var(--text-muted)]">
      <PaperclipIcon size={14} />
    </span>
  );
}

/** One attachment chip in the composer — thumbnail (images) + name + remove. */
function AttachmentChip() {
  return (
    <AttachmentPrimitive.Root
      className="
        relative inline-flex max-w-[200px] items-center gap-1.5
        rounded-[var(--radius-input)] border border-[var(--border-subtle)]
        bg-[var(--panel-2)] py-1 pl-1.5 pr-1 text-xs text-[var(--text)]
      "
    >
      <AttachmentThumbnail />
      <span className="truncate">
        <AttachmentPrimitive.Name />
      </span>
      <AttachmentPrimitive.Remove asChild>
        <button
          type="button"
          aria-label="Remove attachment"
          className="
            ml-0.5 flex h-5 w-5 shrink-0 items-center justify-center
            rounded text-[var(--text-subtle)]
            hover:bg-[var(--panel)] hover:text-[var(--text)]
          "
        >
          <XIcon size={12} />
        </button>
      </AttachmentPrimitive.Remove>
    </AttachmentPrimitive.Root>
  );
}

function ComposerAction({ home = false }: { home?: boolean }) {
  const suggestions = useScopedSuggestions();
  const aui = useAui();
  const refs = useChatEntityRefsOptional();
  const canSuggest = useAuiState(s => !s.thread.isRunning);
  const actionRef = useRef<HTMLDivElement>(null);
  return (
    <div ref={actionRef} className="relative flex min-w-0 items-center gap-2" role="group" aria-label="Message actions">
      <div className="flex min-w-0 flex-1 items-center gap-1">
        <HoverTooltip label="Attach an image or file" placement="top"><ComposerPrimitive.AddAttachment asChild>
          <button
            type="button"
            aria-label="Attach a file"
            title="Attach an image or file"
            className="
              flex h-10 w-10 shrink-0 items-center justify-center rounded-full
              text-[var(--text-subtle)]
              transition-colors hover:bg-[var(--panel-2)] hover:text-[var(--text)]
              focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring-color)]
            "
          >
            <PaperclipIcon size={15} />
          </button>
        </ComposerPrimitive.AddAttachment></HoverTooltip>
        <HoverTooltip label="Suggestions" placement="top"><KebabMenu size="md" portal ariaLabel="Suggestions" title="Suggestions" align="start" menuTitle="Try asking Integral" menuCaption="Choose a prompt, then make it your own." icon={<Sparkles size={15} aria-hidden />} items={suggestions.map(suggestion => ({
          key: suggestion.label, label: suggestion.label, description: suggestion.text, disabled: !canSuggest,
          onClick: () => {
            refs?.resetComposerEntityRefs();
            aui.composer().setText(suggestion.text);
            actionRef.current?.parentElement?.querySelector('textarea')?.focus();
          },
        }))} /></HoverTooltip>
        <ConversationModelPicker />
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <ComposerMicButton />
        <AuiIf condition={(s) => !s.thread.isRunning}>
          <ComposerSendWithRefs
            aria-label={home ? "Ask Integral" : "Send message"}
            className={home ? "flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[var(--cta-bg)] text-[var(--cta-fg)] hover:bg-[var(--cta-hover)] disabled:opacity-50 disabled:cursor-not-allowed focus-visible:ring-2 focus-visible:ring-[var(--focus-ring-color)]" : `
              flex h-10 w-10 shrink-0 items-center justify-center rounded-full
              bg-[var(--cta-bg)] text-[var(--cta-fg)]
              transition-colors hover:bg-[var(--cta-hover)]
              disabled:bg-[var(--badge-muted-bg)] disabled:text-[var(--text-subtle)]
              disabled:cursor-not-allowed
              focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring-color)]
            `}
          />
        </AuiIf>
        <AuiIf condition={(s) => s.thread.isRunning}>
          <ComposerPrimitive.Cancel
            aria-label="Stop generating"
            title="Stop generating"
            className="
              flex h-10 w-10 shrink-0 items-center justify-center rounded-full
              bg-[var(--cta-bg)] text-[var(--cta-fg)]
              transition-colors hover:bg-[var(--cta-hover)]
              focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring-color)]
            "
          >
            <SquareIcon size={11} strokeWidth={2.5} fill="currentColor" />
          </ComposerPrimitive.Cancel>
        </AuiIf>
      </div>
    </div>
  );
}
