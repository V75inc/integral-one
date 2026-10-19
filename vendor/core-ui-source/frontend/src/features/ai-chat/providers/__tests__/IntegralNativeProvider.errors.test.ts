/**
 * A non-409 HTTP failure used to render the raw error envelope — a JSON blob
 * with `error_code`, `timestamp`, `path` — as the assistant's reply. The 409
 * branch already parsed `{message}`; every other status now does too, and
 * falls back to a human sentence carrying the status code.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../../api/session', () => ({
  getAccessToken: vi.fn(() => 'access-1'),
  refreshAccessToken: vi.fn(),
}));
vi.mock('../../../../api/client', () => ({
  getActiveScopeHeader: () => null,
}));
vi.mock('../../../../api/aiChat', () => ({ aiChatApi: {} }));
vi.mock('../../../../config', () => ({ getApiBaseURL: () => 'http://api.test' }));

import { IntegralNativeProvider } from '../IntegralNativeProvider';

function ctx() {
  return {
    threadId: 'thread-1',
    userMessageText: 'hello',
    abortSignal: new AbortController().signal,
  } as never;
}

async function drain(iter: AsyncIterable<unknown>): Promise<unknown[]> {
  const out: unknown[] = [];
  for await (const ev of iter) out.push(ev);
  return out;
}

describe('IntegralNativeProvider.streamTurn non-409 failures', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("says the server's own message when the envelope carries one", async () => {
    const envelope = {
      error_code: 'model_quota',
      message: 'The model quota for this workspace is exhausted.',
      details: {},
      timestamp: '2026-09-08T00:00:00Z',
      path: '/api/chat/threads/thread-1/messages',
    };
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(JSON.stringify(envelope), { status: 500 })),
    );

    const events = (await drain(IntegralNativeProvider.streamTurn(ctx()))) as Array<{
      type: string;
      code?: string;
      message?: string;
    }>;

    expect(events).toHaveLength(1);
    expect(events[0].type).toBe('error');
    expect(events[0].code).toBe('http_500');
    expect(events[0].message).toBe('The model quota for this workspace is exhausted.');
    expect(events[0].message).not.toContain('error_code');
  });

  it('falls back to a human sentence with the status when the body is not JSON', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('<html>Bad Gateway</html>', { status: 502 })),
    );

    const events = (await drain(IntegralNativeProvider.streamTurn(ctx()))) as Array<{
      message?: string;
    }>;

    expect(events[0].message).toContain('HTTP 502');
    expect(events[0].message).not.toContain('<html>');
  });

  it('does not treat an envelope without a message as a message', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ error_code: 'boom' }), { status: 500 }),
      ),
    );

    const events = (await drain(IntegralNativeProvider.streamTurn(ctx()))) as Array<{
      message?: string;
    }>;

    expect(events[0].message).toContain('HTTP 500');
    expect(events[0].message).not.toContain('{');
  });
});

describe("IntegralNativeProvider.streamTurn conflicts", () => {
  it.each([
    [
      "thread_busy",
      "turn_in_flight",
      "This conversation is already responding. Wait for it to finish, or stop it first.",
    ],
    [
      "user_turn_limit",
      "user_turn_limit",
      "Too many conversations are responding.",
    ],
    [
      "harness_tool_effect_unresolved",
      "http_409",
      "The prior Harness run has an unresolved tool effect",
    ],
    [
      "chat_submission_message_mismatch",
      "http_409",
      "The accepted message differs from this request.",
    ],
  ])(
    "distinguishes %s from a busy conversation",
    async (reason, code, message) => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(
          new Response(
            JSON.stringify({
              message,
              details: { reason },
            }),
            { status: 409 },
          ),
        ),
      );
      const events = await drain(IntegralNativeProvider.streamTurn(ctx()));
      expect(events).toEqual([{ type: "error", code, message }]);
    },
  );

  it("does not invent an active response for an unclassified conflict", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          new Response("<html>Conflict</html>", { status: 409 }),
        ),
    );
    const events = await drain(IntegralNativeProvider.streamTurn(ctx()));
    expect(events).toEqual([
      {
        type: "error",
        code: "http_409",
        message:
          "This request conflicts with the current conversation state. Please review it before retrying.",
      },
    ]);
  });
});
