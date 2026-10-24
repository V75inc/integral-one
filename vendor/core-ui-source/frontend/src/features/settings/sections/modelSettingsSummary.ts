import type { GenerationSettings } from "../../../api/aiConfiguration";

export function profileSummary(
  settings: GenerationSettings,
  compact = true,
): string {
  const parts = [
    settings.reasoning_effort ? `${settings.reasoning_effort} reasoning` : "",
    settings.thinking_enabled != null
      ? `Thinking ${settings.thinking_enabled ? "on" : "off"}`
      : "",
    settings.max_tokens
      ? `${settings.max_tokens.toLocaleString()} max output tokens`
      : "",
    settings.context_window
      ? `${settings.context_window.toLocaleString()} context tokens`
      : "",
    settings.thinking_budget
      ? `${settings.thinking_budget.toLocaleString()} thinking tokens`
      : "",
    settings.temperature != null ? `Temperature ${settings.temperature}` : "",
    settings.top_p != null ? `Top-p ${settings.top_p}` : "",
    settings.verbosity ? `${settings.verbosity} detail` : "",
    settings.request_timeout
      ? `${settings.request_timeout}s request limit`
      : "",
    settings.idle_timeout ? `${settings.idle_timeout}s idle limit` : "",
    settings.model_request_limit
      ? `${settings.model_request_limit} model requests per turn`
      : "",
    settings.tool_call_limit
      ? `${settings.tool_call_limit} tool calls per turn`
      : "",
    settings.turn_token_limit
      ? `${settings.turn_token_limit.toLocaleString()} total tokens per turn`
      : "",
    settings.turn_timeout ? `${settings.turn_timeout}s per turn` : "",
  ].filter(Boolean);
  return (
    (compact ? parts.slice(0, 3) : parts).join(" · ") +
      (compact && parts.length > 3 ? ` · +${parts.length - 3} more` : "") ||
    "Provider defaults"
  );
}
