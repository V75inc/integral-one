import type { ChatProvider, NormalizedEvent, TurnContext } from "./types";

/**
 * Stand-in provider for P2 — exercises every event type the surface must
 * render so we can validate theming, streaming, and component wiring before
 * any backend exists.
 *
 * Replace with `IntegralNativeProvider` (P3) once the backend proxy lands.
 */
export const MockEchoProvider: ChatProvider = {
  id: "mock-echo",
  label: "Echo (dev/smoke)",
  serverPersisted: false,
  capabilities: {
    reasoning: true,
    tools: true,
    attachments: false,
    vision: false,
    voice: false,
  },

  async listAgents() {
    return [];
  },

  async *streamTurn(ctx: TurnContext): AsyncIterable<NormalizedEvent> {
    const start = performance.now();
    const aborted = () => ctx.abortSignal.aborted;
    const sleep = (ms: number) =>
      new Promise<void>((resolve, reject) => {
        const id = setTimeout(resolve, ms);
        ctx.abortSignal.addEventListener("abort", () => {
          clearTimeout(id);
          reject(new DOMException("aborted", "AbortError"));
        });
      });

    try {
      yield { type: "status", text: "Routing to mock provider…" };
      await sleep(120);
      if (aborted()) return;

      // Live thinking stream — every chunk carries the SAME segmentId so the
      // runtime merges them into one growing reasoning part (mergeReasoning),
      // which `MarkdownText smooth` types in character-by-character. Small
      // delays make the stream visibly live without a real agent.
      const reasoningChunks = [
        "Looking at the message",
        " and identifying intent.",
        " This is a **mock turn**,",
        " so no real model call is made.",
        " Echoing it back.",
      ];
      for (const chunk of reasoningChunks) {
        yield { type: "reasoning-delta", delta: chunk, segmentId: "r1" };
        await sleep(160);
        if (aborted()) return;
      }

      // One tool call: running → complete, so the tool-group disclosure shows
      // its spinner then resolves (matches the live native provider shape).
      yield {
        type: "tool-call",
        toolCallId: "t1",
        name: "echo_lookup",
        args: { input: ctx.userMessageText },
        status: "running",
      };
      await sleep(220);
      if (aborted()) return;
      yield {
        type: "tool-call",
        toolCallId: "t1",
        name: "echo_lookup",
        args: { input: ctx.userMessageText },
        status: "complete",
        result: { echoed: true, length: ctx.userMessageText.length },
      };
      await sleep(120);
      if (aborted()) return;

      const reply = `Echo: ${ctx.userMessageText}`;
      let firstTokenMs: number | undefined;
      for (const ch of reply) {
        if (firstTokenMs === undefined) firstTokenMs = performance.now() - start;
        yield { type: "text-delta", delta: ch };
        await sleep(18);
        if (aborted()) return;
      }

      const totalMs = performance.now() - start;
      const outputTokens = reply.length;
      yield {
        type: "step",
        usage: {
          inputTokens: ctx.userMessageText.length,
          outputTokens,
        },
        modelId: "mock-echo",
        finishReason: "stop",
      };
      yield {
        type: "message-finish",
        timing: {
          firstTokenMs,
          totalMs,
          tps: outputTokens > 0 ? (outputTokens / totalMs) * 1000 : 0,
        },
      };
    } catch (err) {
      if ((err as DOMException)?.name === "AbortError") return;
      yield {
        type: "error",
        code: "mock_error",
        message: err instanceof Error ? err.message : String(err),
      };
    }
  },
};
