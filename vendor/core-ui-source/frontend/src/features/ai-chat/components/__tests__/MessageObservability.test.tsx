import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  message: {
    role: "assistant",
    status: { type: "complete" },
    metadata: {} as Record<string, unknown>,
  },
}));

vi.mock("@assistant-ui/react", () => ({
  useMessageTiming: () => null,
  useAuiState: (selector: (value: typeof state) => unknown) => selector(state),
}));

import { MessageObservability, useMessageTurnMetrics } from "../MessageObservability";

function CompactMetrics() {
  return <span data-testid="compact-metrics">{useMessageTurnMetrics()}</span>;
}

describe("message usage and cost observability", () => {
  beforeEach(() => {
    state.message.role = "assistant";
    state.message.status.type = "complete";
    state.message.metadata = {};
  });

  it("shows known token totals with per-field call coverage", () => {
    state.message.metadata = {
      custom: {
        steps: [
          { modelId: "provider/a", usage: { inputTokens: 20, outputTokens: 4 }, usageComplete: true },
          { modelId: "provider/b", usage: { inputTokens: 5 }, usageComplete: false },
        ],
      },
    };

    render(<MessageObservability />);

    expect(screen.getByText("Input 25 tokens (2/2 calls reported)")).toBeVisible();
    expect(screen.getByText("Output 4 tokens (1/2 calls reported)")).toBeVisible();
    expect(screen.getByText("Token usage incomplete for 1/2 calls")).toBeVisible();
    expect(screen.queryByText("29 tokens")).not.toBeInTheDocument();
  });

  it("separates reported cost from estimated cost and shows coverage", () => {
    state.message.metadata = {
      custom: {
        steps: [
          { modelId: "provider/a", providerCostUsd: 0.01, costSource: "provider_response", costComplete: false, usage: { inputTokens: 20, outputTokens: 4 } },
          { modelId: "provider/b", providerCostUsd: 0.02, costSource: "litellm_calculated", usage: { inputTokens: 5, outputTokens: 1 } },
          { modelId: "provider/c", costSource: "unavailable", usage: { inputTokens: 8, outputTokens: 1 } },
        ],
      },
    };

    render(<MessageObservability />);

    expect(screen.getByText(/Provider-reported cost \$0\.0100 \(1\/3 calls\)/)).toBeVisible();
    expect(screen.getByText(/Estimated cost \$0\.0200 \(1\/3 calls\)/)).toBeVisible();
    expect(screen.getByText(/Cost unavailable for 1\/3 calls/)).toBeVisible();
    expect(screen.getByText("Reported cost incomplete for 1/3 calls")).toBeVisible();
  });

  it("labels legacy final-payload cost as an estimate", () => {
    state.message.metadata = {
      custom: { finalPayload: { interaction: { usage: { estimated_cost_usd: 0.004 } } } },
    };

    render(<MessageObservability />);

    expect(screen.getByText(/Estimated cost \$0\.0040/)).toBeVisible();
    expect(screen.queryByText("$0.0040")).not.toBeInTheDocument();
  });

  it("summarizes the whole turn and all calls without double-counting final usage", () => {
    state.message.metadata = { custom: {
      latency: { totalMs: 4200 },
      steps: [
        { durationMs: 1000, usage: { inputTokens: 1000, outputTokens: 100 } },
        { durationMs: 500, usage: { inputTokens: 150, outputTokens: 30 } },
      ],
      finalPayload: { interaction: { usage: { total_tokens: 1280 } } },
    } };
    render(<CompactMetrics />);
    expect(screen.getByTestId("compact-metrics")).toHaveTextContent("4.2s · 1.3K tokens");
  });

  it("labels partial token reporting without inventing a complete total", () => {
    state.message.metadata = { custom: { steps: [
      { usage: { inputTokens: 20, outputTokens: 4 } },
      { usage: { inputTokens: 5 }, usageComplete: false },
    ] } };
    render(<CompactMetrics />);
    expect(screen.getByTestId("compact-metrics")).toHaveTextContent("29 tokens reported");
  });

  it("uses persisted model-call usage and preserves reported zero tokens", () => {
    state.message.metadata = { custom: { finalPayload: { interaction: {
      observability_metrics: [{ event_type: "model_call", data: { usage: { prompt_tokens: 0, completion_tokens: 0 } } }],
    } } } };
    render(<CompactMetrics />);
    expect(screen.getByTestId("compact-metrics")).toHaveTextContent("0 tokens");
  });

  it("supports final aggregate usage when call details are absent", () => {
    state.message.metadata = { custom: { finalPayload: { interaction: { usage: { total_tokens: 123 } } } } };
    render(<CompactMetrics />);
    expect(screen.getByTestId("compact-metrics")).toHaveTextContent("123 tokens");
  });

  it("abbreviates million-token totals", () => {
    state.message.metadata = { custom: { finalPayload: { interaction: { usage: { total_tokens: 1234567 } } } } };
    render(<CompactMetrics />);
    expect(screen.getByTestId("compact-metrics")).toHaveTextContent("1.2M tokens");
  });

  it("omits unavailable duration and tokens rather than fabricating zero", () => {
    state.message.metadata = { custom: { steps: [{ durationMs: 900 }] } };
    render(<CompactMetrics />);
    expect(screen.getByTestId("compact-metrics")).toBeEmptyDOMElement();
  });
});
