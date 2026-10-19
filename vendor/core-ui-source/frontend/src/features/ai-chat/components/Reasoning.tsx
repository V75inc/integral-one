"use client";

// jvchat-faithful reasoning section, ported from jvchat's
// `components/assistant-ui/reasoning.tsx` and retokenized to integral CSS vars.
//
// Structure + animation choreography are preserved verbatim from jvchat:
//   - bordered collapsible with a brain-icon trigger
//   - shimmering label while the model is actively reasoning
//   - chevron that rotates on open/close
//   - smooth markdown body (rendered via integral's <MarkdownText/>) that
//     tails the stream (MutationObserver auto-scroll, yields if user scrolls up)
//   - fade gradient at the bottom of the scroll region
//   - collapsible-down / collapsible-up height animation
//
// Only colors and the listed v4 -> v3.4 syntactic items changed:
//   shadcn token classes -> integral CSS vars; v4 css-var duration shorthand ->
//   named scale (duration-200). Named-group variants, size-*, data-state,
//   animate-in/out, logical props are all v3.4-valid and kept as-is.
import { memo, useCallback, useEffect, useRef, useState } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { BrainIcon, ChevronDownIcon } from "lucide-react";
import {
  useScrollLock,
  useAuiState,
  type ReasoningMessagePartComponent,
  type ReasoningGroupComponent,
} from "@assistant-ui/react";
import { MarkdownText } from "./MarkdownText";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "../../../components/ui/collapsible";
import { cn } from "../../../lib/cn";

const ANIMATION_DURATION = 200;

const reasoningVariants = cva("aui-reasoning-root mb-4 w-full", {
  variants: {
    variant: {
      // v4 `rounded-lg border px-3 py-2` -> integral border token.
      outline: "rounded-lg border border-[var(--border-subtle)] px-3 py-2",
      ghost: "",
      // v4 `bg-muted/50 rounded-lg px-3 py-2` -> integral panel-2.
      muted: "bg-[var(--panel-2)] rounded-lg px-3 py-2",
    },
  },
  defaultVariants: {
    variant: "outline",
  },
});

export type ReasoningRootProps = Omit<
  React.ComponentProps<typeof Collapsible>,
  "open" | "onOpenChange"
> &
  VariantProps<typeof reasoningVariants> & {
    open?: boolean;
    onOpenChange?: (open: boolean) => void;
    defaultOpen?: boolean;
  };

function ReasoningRoot({
  className,
  variant,
  open: controlledOpen,
  onOpenChange: controlledOnOpenChange,
  defaultOpen = false,
  children,
  ...props
}: ReasoningRootProps) {
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
      data-slot="reasoning-root"
      data-variant={variant}
      open={isOpen}
      onOpenChange={handleOpenChange}
      className={cn(
        "group/reasoning-root",
        reasoningVariants({ variant, className }),
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

function ReasoningFade({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="reasoning-fade"
      className={cn(
        "aui-reasoning-fade pointer-events-none absolute inset-x-0 bottom-0 z-10 h-8",
        // v4 `var(--color-background)` -> integral `--bg`.
        "bg-[linear-gradient(to_top,var(--bg),transparent)]",
        // v4 `hsl(var(--muted)/0.5)` -> integral `--panel-2`.
        "group-data-[variant=muted]/reasoning-root:bg-[linear-gradient(to_top,var(--panel-2),transparent)]",
        "fade-in-0 animate-in",
        "group-data-[state=open]/collapsible-content:animate-out",
        "group-data-[state=open]/collapsible-content:fade-out-0",
        "group-data-[state=open]/collapsible-content:delay-150",
        "group-data-[state=open]/collapsible-content:fill-mode-forwards",
        "duration-200",
        "group-data-[state=open]/collapsible-content:duration-200",
        className,
      )}
      {...props}
    />
  );
}

function ReasoningTrigger({
  active,
  duration,
  label,
  className,
  ...props
}: React.ComponentProps<typeof CollapsibleTrigger> & {
  active?: boolean;
  duration?: number;
  /** Overrides the "Reasoning" text (e.g. the live thinking status). */
  label?: React.ReactNode;
}) {
  const durationText = duration ? ` (${duration}s)` : "";
  const content = label ?? `Reasoning${durationText}`;

  return (
    <CollapsibleTrigger
      data-slot="reasoning-trigger"
      className={cn(
        "aui-reasoning-trigger group/trigger text-[var(--text-muted)] hover:text-[var(--text)] flex max-w-[75%] items-center gap-2 py-1.5 text-sm leading-5 transition-colors",
        className,
      )}
      {...props}
    >
      <BrainIcon
        data-slot="reasoning-trigger-icon"
        className="aui-reasoning-trigger-icon size-4 shrink-0"
      />
      <span
        data-slot="reasoning-trigger-label"
        className="aui-reasoning-trigger-label-wrapper relative inline-block truncate leading-5"
      >
        <span>{content}</span>
        {active ? (
          <span
            aria-hidden
            data-slot="reasoning-trigger-shimmer"
            className="aui-reasoning-trigger-shimmer shimmer pointer-events-none absolute inset-0 truncate motion-reduce:animate-none"
          >
            {content}
          </span>
        ) : null}
      </span>
      <ChevronDownIcon
        data-slot="reasoning-trigger-chevron"
        className={cn(
          "aui-reasoning-trigger-chevron mt-0.5 size-4 shrink-0",
          "transition-transform duration-200 ease-out",
          "group-data-[state=closed]/trigger:-rotate-90",
          "group-data-[state=open]/trigger:rotate-0",
        )}
      />
    </CollapsibleTrigger>
  );
}

function ReasoningContent({
  className,
  children,
  ...props
}: React.ComponentProps<typeof CollapsibleContent>) {
  return (
    <CollapsibleContent
      data-slot="reasoning-content"
      className={cn(
        "aui-reasoning-content text-[var(--text-muted)] relative overflow-hidden text-xs outline-none",
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
      {children}
      <ReasoningFade />
    </CollapsibleContent>
  );
}

function ReasoningText({
  className,
  onScroll,
  ...props
}: React.ComponentProps<"div">) {
  const ref = useRef<HTMLDivElement>(null);
  // Tail the streaming reasoning: stick to the bottom as new text arrives, but
  // yield if the user scrolls up (resume once they return near the bottom).
  const stickRef = useRef(true);

  const handleScroll = useCallback(
    (e: React.UIEvent<HTMLDivElement>) => {
      const el = ref.current;
      if (el) {
        const dist = el.scrollHeight - el.scrollTop - el.clientHeight;
        stickRef.current = dist < 24;
      }
      onScroll?.(e);
    },
    [onScroll],
  );

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const toBottom = () => {
      if (stickRef.current) el.scrollTop = el.scrollHeight;
    };
    toBottom();
    // Text streams in as DOM/text mutations; follow each one while pinned.
    const mo = new MutationObserver(toBottom);
    mo.observe(el, { childList: true, subtree: true, characterData: true });
    return () => mo.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      onScroll={handleScroll}
      data-slot="reasoning-text"
      className={cn(
        "aui-reasoning-text relative z-0 max-h-64 space-y-4 overflow-y-auto ps-6 pt-2 pb-2 leading-relaxed",
        "transform-gpu transition-[transform,opacity]",
        "group-data-[state=open]/collapsible-content:animate-in",
        "group-data-[state=closed]/collapsible-content:animate-out",
        "group-data-[state=open]/collapsible-content:fade-in-0",
        "group-data-[state=closed]/collapsible-content:fade-out-0",
        "group-data-[state=open]/collapsible-content:slide-in-from-top-4",
        "group-data-[state=closed]/collapsible-content:slide-out-to-top-4",
        "group-data-[state=open]/collapsible-content:duration-200",
        "group-data-[state=closed]/collapsible-content:duration-200",
        className,
      )}
      {...props}
    />
  );
}

const ReasoningImpl: ReasoningMessagePartComponent = () => <MarkdownText />;

const ReasoningGroupImpl: ReasoningGroupComponent = ({
  children,
  startIndex,
  endIndex,
}) => {
  const isReasoningStreaming = useAuiState((s) => {
    if (s.message.status?.type !== "running") return false;
    const lastIndex = s.message.parts.length - 1;
    if (lastIndex < 0) return false;
    const lastType = s.message.parts[lastIndex]?.type;
    if (lastType !== "reasoning") return false;
    return lastIndex >= startIndex && lastIndex <= endIndex;
  });

  return (
    <ReasoningRoot defaultOpen={isReasoningStreaming}>
      <ReasoningTrigger active={isReasoningStreaming} />
      <ReasoningContent aria-busy={isReasoningStreaming}>
        <ReasoningText>{children}</ReasoningText>
      </ReasoningContent>
    </ReasoningRoot>
  );
};

const Reasoning = memo(
  ReasoningImpl,
) as unknown as ReasoningMessagePartComponent & {
  Root: typeof ReasoningRoot;
  Trigger: typeof ReasoningTrigger;
  Content: typeof ReasoningContent;
  Text: typeof ReasoningText;
  Fade: typeof ReasoningFade;
};

Reasoning.displayName = "Reasoning";
Reasoning.Root = ReasoningRoot;
Reasoning.Trigger = ReasoningTrigger;
Reasoning.Content = ReasoningContent;
Reasoning.Text = ReasoningText;
Reasoning.Fade = ReasoningFade;

const ReasoningGroup = memo(ReasoningGroupImpl);
ReasoningGroup.displayName = "ReasoningGroup";

export {
  Reasoning,
  ReasoningGroup,
  ReasoningRoot,
  ReasoningTrigger,
  ReasoningContent,
  ReasoningText,
  ReasoningFade,
  reasoningVariants,
};
