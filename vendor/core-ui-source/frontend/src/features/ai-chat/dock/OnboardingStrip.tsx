import { Surface, Text } from '../../../ui';
import { Button } from '../../../components/ui';
import { useCallback, useEffect } from "react";
import { useAuiState } from "@assistant-ui/react";
import { Sparkles } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useFirstLoginOnboarding } from "../../../hooks/useFirstLoginOnboarding";
import { useAssistantDock } from "../../../context/AssistantDockContext";
import { useAuthOptional } from "../../../context/AuthContext";

/**
 * First-login framing inside the dock: what to say, and a way out.
 *
 * Dismisses once the user starts a conversation or acknowledges the hint.
 * Keeping it inline means onboarding is the same surface as every later
 * conversation rather than a one-off dialog the user never sees again.
 */
export function OnboardingStrip() {
  const { dismiss } = useFirstLoginOnboarding();
  const { setOnboarding } = useAssistantDock();
  const auth = useAuthOptional();
  const qc = useQueryClient();

  const hasUserMessage = useAuiState(s => s.thread.messages.some(message => message.role === "user"));
  const handleDismiss = useCallback(() => {
    // Refresh the user so a completed `onboarded_at` propagates even when the
    // chat surface never signalled completion — belt and braces, same as the
    // modal did.
    auth?.refreshUser?.().catch(() => {
      /* best effort */
    });
    qc.invalidateQueries({ queryKey: ["auth", "me"] });
    setOnboarding(false);
    dismiss();
  }, [auth, qc, setOnboarding, dismiss]);

  useEffect(() => {
    if (hasUserMessage) handleDismiss();
  }, [hasUserMessage, handleDismiss]);

  if (hasUserMessage) return null;

  return (
    <div
      data-testid="onboarding-seed-hint"
      className="pointer-events-none absolute inset-x-0 top-0 z-20 p-3"
    >
      <Surface tone="panel" border="default" radius="card" elevation="pop" padding="sm" className="pointer-events-auto flex items-start gap-3">
        <span
          aria-hidden="true"
          className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-[var(--badge-muted-bg)] text-[var(--brand-accent)]"
        >
          <Sparkles size={15} strokeWidth={1.8} />
        </span>
        <div className="min-w-0 flex-1">
          <Text as="p" variant="body-sm" weight="medium" className="leading-snug [text-wrap:balance]">
            Get started with your workspace
          </Text>
          <Text as="p" variant="meta" tone="muted" className="mt-1 leading-relaxed [text-wrap:pretty]">
            Say hello and I&rsquo;ll help you set up your Apps and Tracks.
          </Text>
        </div>
        <Button variant="ghost" size="sm"
          type="button"
          onClick={handleDismiss}
          aria-label="Ok"
          className="min-h-10 shrink-0 self-center"
        >
          Ok
        </Button>
      </Surface>
    </div>
  );
}
