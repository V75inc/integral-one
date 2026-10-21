import { Link } from "react-router-dom";
import { Surface, Text } from "../../../ui";
import { modelSetupMessage } from "./assistantMessagePresentation";

/** Shared by preflight and failed turns, including restored conversations. */
export function ModelSetupNotice({ code }: { code: unknown }) {
  const initialSetup = ["model_key_required", "model_setup_required", "native_model_not_configured"].includes(String(code));
  return (
    <Surface role="status" padding="md" className="flex min-w-0 flex-col gap-2">
      <Text as="p" variant="body" weight="semibold">
        {initialSetup ? "Let's set up your chat" : "Your AI connection needs attention"}
      </Text>
      <Text as="p" variant="body-sm" tone="muted">{modelSetupMessage(code)}</Text>
      <Link to="/settings#ai-models" className="self-start rounded-[var(--radius-input)] font-medium text-[var(--brand-accent)] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring-color)]">
        Open AI Models
      </Link>
      <Text as="p" variant="body-sm" tone="muted">
        Need a hand? Your workspace administrator can help with setup.
      </Text>
    </Surface>
  );
}
