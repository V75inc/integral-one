"use client";

import { ExpandableChatError } from "./ExpandableChatError";

import { friendlyToolFailure, fullErrorMessage } from "./assistantMessagePresentation";

// jvchat-faithful per-tool-call card, ported from jvchat's
// `components/assistant-ui/tool-fallback.tsx` and retokenized to integral CSS
// vars.
//
// Renders a collapsible card per tool call: a status icon (loader while
// running, check on complete, x on incomplete/error, alert on
// requires-action), a "Used tool: <name>" trigger (shimmering while running,
// struck-through "Cancelled tool" when cancelled), and — when expanded — the
// error, args, and result sections. Collapse choreography (collapsible-down/up,
// chevron rotate) is preserved verbatim.
//
// Integral runtime tool-call parts (DraftToolCallPart in runtime/NormalizedEvent
// .ts) carry `{toolCallId, toolName, args, argsText?, result?, isError?,
// status?}` where `status` is ALREADY an assistant-ui
// `ToolCallMessagePartStatus`. So `status` is passed straight through — no remap
// needed. The one bridge: integral can mark a part `isError: true` while its
// `status.type` is still "complete" (the tool returned an error payload but the
// part itself completed). To surface that faithfully through jvchat's
// status-driven UI, we derive an EFFECTIVE status that promotes such a part to
// `incomplete` (so the x icon + Error section show). When `argsText` is absent
// we render args via JSON.stringify.
//
// v4 -> v3.4: shadcn tokens -> integral CSS vars (incl. destructive ->
// --danger-fg/--panel-2); v4 css-var duration shorthand -> named scale (duration-200).
import { memo, useCallback, useRef, useState } from "react";
import {
  AlertCircleIcon,
  CheckIcon,
  StopCircleIcon,
  ChevronDownIcon,
  LoaderIcon,
  XCircleIcon,
} from "lucide-react";
import {
  useScrollLock,
  type ToolCallMessagePartStatus,
  type ToolCallMessagePartComponent,
} from "@assistant-ui/react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "../../../components/ui/collapsible";
import { cn } from "../../../lib/cn";
import { formatToolValue } from "../../../utils/tryParseJsonDisplay";
import { useQuery } from "@tanstack/react-query";
import { connectorsApi } from "../../../api/connectors";
import { mcpConnectorDetails } from "../../settings/connectors/mcpConnectorDetails";
import {
  formatMcpToolLabel,
  mcpToolLabel,
  parseMcpToolName,
} from "./mcpToolLabel";

const ANIMATION_DURATION = 200;

export type ToolFallbackRootProps = Omit<
  React.ComponentProps<typeof Collapsible>,
  "open" | "onOpenChange"
> & {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  defaultOpen?: boolean;
};

function ToolFallbackRoot({
  className,
  open: controlledOpen,
  onOpenChange: controlledOnOpenChange,
  defaultOpen = false,
  children,
  ...props
}: ToolFallbackRootProps) {
  const collapsibleRef = useRef<HTMLDivElement>(null);
  const [uncontrolledOpen, setUncontrolledOpen] = useState(defaultOpen);
  const lockScroll = useScrollLock(collapsibleRef, ANIMATION_DURATION);

  const isControlled = controlledOpen !== undefined;
  const isOpen = isControlled ? controlledOpen : uncontrolledOpen;

  const handleOpenChange = useCallback(
    (open: boolean) => {
      if (!open) {
        lockScroll();
      }
      if (!isControlled) {
        setUncontrolledOpen(open);
      }
      controlledOnOpenChange?.(open);
    },
    [lockScroll, isControlled, controlledOnOpenChange],
  );

  return (
    <Collapsible
      ref={collapsibleRef}
      data-slot="tool-fallback-root"
      open={isOpen}
      onOpenChange={handleOpenChange}
      className={cn(
        "aui-tool-fallback-root group/tool-fallback-root w-full rounded-lg border border-[var(--border-subtle)] py-3",
        className,
      )}
      style={
        {
          "--animation-duration": `${ANIMATION_DURATION}ms`,
        } as React.CSSProperties
      }
      {...props}
    >
      {children}
    </Collapsible>
  );
}

type ToolStatus = ToolCallMessagePartStatus["type"];

const statusIconMap: Record<ToolStatus, React.ElementType> = {
  running: LoaderIcon,
  complete: CheckIcon,
  incomplete: XCircleIcon,
  "requires-action": AlertCircleIcon,
};

function ToolFallbackTrigger({
  toolName,
  status,
  className,
  ...props
}: React.ComponentProps<typeof CollapsibleTrigger> & {
  toolName: string;
  status?: ToolCallMessagePartStatus;
}) {
  const statusType = status?.type ?? "complete";
  const isRunning = statusType === "running";
  const isCancelled =
    status?.type === "incomplete" && status.reason === "cancelled";

  const Icon = isCancelled ? StopCircleIcon : statusIconMap[statusType];
  const label = isCancelled ? "Stopped step" : "Used tool";

  return (
    <CollapsibleTrigger
      data-slot="tool-fallback-trigger"
      className={cn(
        "aui-tool-fallback-trigger group/trigger flex w-full items-center gap-2 px-4 text-xs transition-colors",
        className,
      )}
      {...props}
    >
      <Icon
        data-slot="tool-fallback-trigger-icon"
        className={cn(
          "aui-tool-fallback-trigger-icon size-4 shrink-0",
          isCancelled && "text-[var(--text-muted)]",
          isRunning && "animate-spin",
        )}
      />
      <span
        data-slot="tool-fallback-trigger-label"
        className={cn(
          "aui-tool-fallback-trigger-label-wrapper relative inline-block grow text-start leading-none",
          isCancelled && "text-[var(--text-muted)]",
        )}
      >
        <span>
          {label}: <b>{toolName}</b>
        </span>
        {isRunning && (
          <span
            aria-hidden
            data-slot="tool-fallback-trigger-shimmer"
            className="aui-tool-fallback-trigger-shimmer shimmer pointer-events-none absolute inset-0 motion-reduce:animate-none"
          >
            {label}: <b>{toolName}</b>
          </span>
        )}
      </span>
      <ChevronDownIcon
        data-slot="tool-fallback-trigger-chevron"
        className={cn(
          "aui-tool-fallback-trigger-chevron size-4 shrink-0",
          "transition-transform duration-200 ease-out",
          "group-data-[state=closed]/trigger:-rotate-90",
          "group-data-[state=open]/trigger:rotate-0",
        )}
      />
    </CollapsibleTrigger>
  );
}

function ToolFallbackContent({
  className,
  children,
  ...props
}: React.ComponentProps<typeof CollapsibleContent>) {
  return (
    <CollapsibleContent
      data-slot="tool-fallback-content"
      className={cn(
        "aui-tool-fallback-content relative overflow-hidden text-xs outline-none",
        "group/collapsible-content ease-out",
        "data-[state=closed]:animate-collapsible-up",
        "data-[state=open]:animate-collapsible-down",
        "data-[state=closed]:fill-mode-forwards",
        "data-[state=closed]:pointer-events-none",
        "data-[state=open]:duration-200",
        "data-[state=closed]:duration-200",
        className,
      )}
      {...props}
    >
      <div className="mt-3 flex flex-col gap-2 border-t border-[var(--border-subtle)] pt-2">
        {children}
      </div>
    </CollapsibleContent>
  );
}

function ToolFallbackArgs({
  argsText,
  className,
  ...props
}: React.ComponentProps<"div"> & {
  argsText?: string;
}) {
  if (!argsText || argsText.trim() === "{}") return null;

  return (
    <div
      data-slot="tool-fallback-args"
      className={cn("aui-tool-fallback-args px-4", className)}
      {...props}
    >
      <pre className="aui-tool-fallback-args-value whitespace-pre-wrap break-words rounded border border-[var(--border-subtle)] bg-[var(--panel-2)] p-2 font-mono">
        {formatToolValue(argsText)}
      </pre>
    </div>
  );
}

function ToolFallbackResult({
  result,
  className,
  ...props
}: React.ComponentProps<"div"> & {
  result?: unknown;
}) {
  if (result === undefined) return null;
  let parsed = result;
  if (typeof result === "string") {
    try { parsed = JSON.parse(result); } catch { /* Ordinary text result. */ }
  }
  if (parsed && typeof parsed === "object" && "error" in parsed && parsed.error) {
    return <ExpandableChatError className="px-4 text-[var(--danger-fg)]" summary={friendlyToolFailure(parsed)}>{fullErrorMessage(parsed)}</ExpandableChatError>;
  }

  return (
    <div
      data-slot="tool-fallback-result"
      className={cn(
        "aui-tool-fallback-result border-t border-dashed border-[var(--border-subtle)] px-4 pt-2",
        className,
      )}
      {...props}
    >
      <p className="aui-tool-fallback-result-header font-semibold">Result:</p>
      <pre className="aui-tool-fallback-result-content whitespace-pre-wrap break-words rounded border border-[var(--border-subtle)] bg-[var(--panel-2)] p-2 font-mono">
        {formatToolValue(result)}
      </pre>
    </div>
  );
}

function ToolFallbackError({
  status,
  className,
  ...props
}: React.ComponentProps<"div"> & {
  status?: ToolCallMessagePartStatus;
}) {
  if (status?.type !== "incomplete") return null;

  if (!status.error && status.reason !== "cancelled") return null;
  const isCancelled = status.reason === "cancelled";
  const errorText = isCancelled ? "You stopped this request." : friendlyToolFailure(status.error);
  const headerText = isCancelled ? "Stopped" : "This step couldn't be finished";

  return (
    <div
      data-slot="tool-fallback-error"
      className={cn("aui-tool-fallback-error px-4", className)}
      {...props}
    >
      <p className={cn("aui-tool-fallback-error-header font-semibold", isCancelled ? "text-[var(--text-muted)]" : "text-[var(--danger-fg)]")}>
        {headerText}
      </p>
      {isCancelled ? (
        <p className="aui-tool-fallback-error-reason whitespace-pre-wrap text-[var(--text-muted)]">{errorText}</p>
      ) : (
        <ExpandableChatError summary={errorText} className="aui-tool-fallback-error-reason text-[var(--danger-fg)]">
          {fullErrorMessage(status.error)}
        </ExpandableChatError>
      )}
    </div>
  );
}

// Integral tool-call parts carry both `status` (a ToolCallMessagePartStatus) and
// a separate `isError` flag. jvchat's UI is purely status-driven, so to surface
// an integral error faithfully we promote an `isError` part whose status isn't
// already a terminal failure into an `incomplete` status carrying the error
// payload (the result). This drives the x icon + Error section while leaving the
// underlying part untouched.
function deriveEffectiveStatus(
  status: ToolCallMessagePartStatus | undefined,
  isError: boolean | undefined,
  result: unknown,
): ToolCallMessagePartStatus | undefined {
  if (!isError) return status;
  if (status?.type === "incomplete") return status;
  return { type: "incomplete", reason: "error", error: result };
}

const ToolFallbackImpl: ToolCallMessagePartComponent = (props) => {
  const { toolName, argsText, args, result, status } = props;
  // A mounted MCP tool renders as `mcp__<short-id>__<remote>`, which tells the
  // user nothing about which third party was just contacted. Resolve it to
  // "search_files on Google Drive" when the connector is known.
  const connectors = useQuery({
    queryKey: ['connectors', 'list'],
    queryFn: () => connectorsApi.list(),
    enabled: parseMcpToolName(toolName) !== null,
    staleTime: 60_000,
  });
  const mcpLabel = mcpToolLabel(
    toolName,
    connectors.data?.connectors,
    c => mcpConnectorDetails(c).title || c.kind,
  );
  const displayToolName = mcpLabel ? formatMcpToolLabel(mcpLabel) : toolName;
  // Integral's runtime adds an `isError` flag alongside the assistant-ui
  // status; it isn't on the assistant-ui prop type, so read it via a typed view.
  const isError = (props as { isError?: boolean }).isError;
  const effectiveStatus = deriveEffectiveStatus(status, isError, result);

  const isCancelled =
    effectiveStatus?.type === "incomplete" &&
    effectiveStatus.reason === "cancelled";

  // jvchat renders args from `argsText`; integral's runtime always populates it
  // (defaulting to JSON.stringify(args)), but fall back to a serialization of
  // the parsed `args` object if a caller ever omits it.
  const resolvedArgsText =
    argsText ??
    (args !== undefined && Object.keys(args).length > 0
      ? JSON.stringify(args, null, 2)
      : undefined);

  return (
    <ToolFallbackRoot
      className={cn(
        isCancelled && "border-[var(--border-subtle)] bg-[var(--panel-2)]",
      )}
    >
      <ToolFallbackTrigger toolName={displayToolName} status={effectiveStatus} />
      <ToolFallbackContent>
        <ToolFallbackError status={effectiveStatus} />
        {effectiveStatus?.type !== "incomplete" && <ToolFallbackArgs
          argsText={resolvedArgsText}
          className={cn(isCancelled && "opacity-60")}
        />}
        {effectiveStatus?.type !== "incomplete" && <ToolFallbackResult result={result} />}
      </ToolFallbackContent>
    </ToolFallbackRoot>
  );
};

const ToolFallback = memo(
  ToolFallbackImpl,
) as unknown as ToolCallMessagePartComponent & {
  Root: typeof ToolFallbackRoot;
  Trigger: typeof ToolFallbackTrigger;
  Content: typeof ToolFallbackContent;
  Args: typeof ToolFallbackArgs;
  Result: typeof ToolFallbackResult;
  Error: typeof ToolFallbackError;
};

ToolFallback.displayName = "ToolFallback";
ToolFallback.Root = ToolFallbackRoot;
ToolFallback.Trigger = ToolFallbackTrigger;
ToolFallback.Content = ToolFallbackContent;
ToolFallback.Args = ToolFallbackArgs;
ToolFallback.Result = ToolFallbackResult;
ToolFallback.Error = ToolFallbackError;

export {
  ToolFallback,
  ToolFallbackRoot,
  ToolFallbackTrigger,
  ToolFallbackContent,
  ToolFallbackArgs,
  ToolFallbackResult,
  ToolFallbackError,
};
