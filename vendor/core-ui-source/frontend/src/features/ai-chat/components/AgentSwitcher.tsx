import { useEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown } from "lucide-react";

import { Avatar, LogoMark, LINE_ICON_STROKE } from "../../../components/ui";
import { Text } from "../../../ui";
import { useAgentCatalog } from "../useAgentCatalog";
import type { AgentDescriptor, ChatProvider } from "../providers/types";

/** Ops-layer capability line — Integral is the ops layer on a pluggable harness. */
const OPS_CAPABILITY_LINE = "Your workspace assistant";

const ECHO_HARNESS: AgentDescriptor = {
  id: "echo-mock",
  name: "Echo",
  description:
    "Repeats your messages for testing. Does not use an AI model.",
  role_label: "Test assistant",
};

interface AgentSwitcherProps {
  provider: ChatProvider;
  workspaceId: string;
  /** When true, the trigger is visually muted and disabled. The page
   *  passes the active streaming flag here so users can't change agents
   *  mid-turn. */
  isStreaming?: boolean;
}

/**
 * Harness switcher — top of conversations sidebar on the `/agent` surface.
 *
 * Frames the active harness provider for Integral's ops layer (staging ·
 * skills · MCP), not a multi-agent coworker roster. Selecting a different
 * harness updates the per-workspace preference and (via the parent surface's
 * threadlist adapter) triggers a fresh thread scoped to the new harness.
 *
 * Echo (mock-echo) has an empty catalog — we still show a static
 * "Test assistant" identity so the surface stays honest about what is
 * powering the ops layer.
 */
export function AgentSwitcher({
  provider,
  workspaceId,
  isStreaming = false,
}: AgentSwitcherProps) {
  const { agents, activeAgent, switchAgent } = useAgentCatalog(
    provider,
    workspaceId,
  );
  const isEcho = provider.id === "mock-echo";
  const displayAgents =
    agents.length > 0 ? agents : isEcho ? [ECHO_HARNESS] : [];
  const displayActive =
    activeAgent ?? (isEcho ? ECHO_HARNESS : null);
  const canPick = agents.length > 1;

  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const [popoverPos, setPopoverPos] = useState<
    { top: number; left: number; width: number } | null
  >(null);

  useEffect(() => {
    if (!open || !triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    setPopoverPos({
      top: rect.bottom + 6,
      left: rect.left,
      width: rect.width,
    });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      const t = e.target as Node | null;
      if (!t) return;
      if (triggerRef.current?.contains(t)) return;
      if (popoverRef.current?.contains(t)) return;
      setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const onPick = async (agentId: string) => {
    setOpen(false);
    await switchAgent(agentId);
  };

  // Mobile drawer closes on any bubbling click inside the dialog (see
  // AIChatPage). Halt propagation so opening the picker doesn't also
  // dismiss the drawer — which would leave the portal-rendered popover
  // orphaned over the chat content.
  const haltDrawerClose = (e: ReactMouseEvent) => {
    e.stopPropagation();
  };

  if (displayAgents.length === 0 || !displayActive) return null;

  const roleLabel =
    displayActive.id === "integral_core" ? OPS_CAPABILITY_LINE : displayActive.role_label ||
    (isEcho || displayActive.id === ECHO_HARNESS.id
      ? "Test assistant"
      : null);

  return (
    <div
      className="border-b border-[var(--panel-border)] px-2 py-3"
      onClick={haltDrawerClose}
    >
      <button
        ref={triggerRef}
        type="button"
        aria-label="Active agent"
        aria-haspopup={canPick ? "menu" : undefined}
        aria-expanded={canPick ? open : undefined}
        disabled={isStreaming || !canPick}
        onClick={() => {
          if (!canPick) return;
          setOpen((s) => !s);
        }}
        className={[
          "flex w-full items-center gap-2.5 rounded-[var(--radius-input)]",
          "px-2 py-2 text-left",
          isStreaming || !canPick
            ? "opacity-60 cursor-default"
            : "hover:bg-[var(--panel-2)] cursor-pointer",
          "transition-colors",
        ].join(" ")}
      >
        <AgentAvatar agent={displayActive} size="sm" native={provider.id === "integral_native"} />
        <span className="flex flex-1 min-w-0 flex-col leading-tight">
          <Text truncate weight="medium">
            {displayActive.name}
          </Text>
          {roleLabel ? (
            <Text variant="meta" tone="subtle" truncate>
              {roleLabel}
            </Text>
          ) : null}
        </span>
        {canPick ? (
          <ChevronDown
            size={14}
            strokeWidth={LINE_ICON_STROKE}
            className="shrink-0 text-[var(--text-subtle)]"
          />
        ) : null}
      </button>

      {open && canPick && popoverPos
        ? createPortal(
            <div
              ref={popoverRef}
              role="menu"
              aria-label="Agent"
              className="fixed z-popover max-h-[60vh] overflow-y-auto rounded-md border border-[var(--panel-border)] bg-[var(--panel)] shadow-[var(--shadow-pop)]"
              style={{
                top: popoverPos.top,
                left: popoverPos.left,
                width: popoverPos.width,
              }}
            >
              <div className="px-3 py-2 text-[10px] uppercase tracking-[0.08em] text-[var(--text-subtle)]">
                Active agent
              </div>
              <p className="px-3 pb-2 text-[11px] leading-snug text-[var(--text-muted)]">
                Provider for this workspace&apos;s ops layer — not a roster of
                peer minds.
              </p>
              {displayAgents.map((agent) => {
                const agentRole =
                  agent.role_label ||
                  (agent.id === ECHO_HARNESS.id
                    ? "Test assistant"
                    : null);
                return (
                  <button
                    key={agent.id}
                    role="menuitem"
                    aria-current={agent.id === displayActive.id}
                    type="button"
                    onClick={() => onPick(agent.id)}
                    className="flex w-full items-start gap-3 px-3 py-2 text-left hover:bg-[var(--panel-2)]"
                  >
                    <AgentAvatar agent={agent} size="xs" native={provider.id === "integral_native"} />
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate text-sm font-medium text-[var(--text)]">
                        {agent.name}
                      </span>
                      {agent.description ? (
                        <span className="line-clamp-2 text-[11px] leading-snug text-[var(--text-muted)]">
                          {agent.description}
                        </span>
                      ) : agentRole ? (
                        <span className="truncate text-[11px] text-[var(--text-muted)]">
                          {agentRole}
                        </span>
                      ) : null}
                    </span>
                    {agent.id === displayActive.id ? (
                      <Check
                        size={14}
                        strokeWidth={LINE_ICON_STROKE}
                        className="mt-1 shrink-0 text-[var(--text)]"
                      />
                    ) : null}
                  </button>
                );
              })}
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}

function AgentAvatar({
  agent,
  size,
  native = false,
}: {
  agent: AgentDescriptor;
  size: "xs" | "sm";
  native?: boolean;
}) {
  if (native && !agent.avatar_url) {
    return (
      <span className={`inline-flex shrink-0 items-center justify-center ${size === "sm" ? "h-8 w-8" : "h-6 w-6"}`}>
        <LogoMark size={size} />
      </span>
    );
  }
  return <Avatar name={agent.name} size={size} url={agent.avatar_url} />;
}
