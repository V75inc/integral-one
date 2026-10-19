/**
 * The chat turn stream is a raw `fetch` (SSE), so it never passed through the
 * axios client's 401 → refresh → retry interceptor that every other surface
 * relies on. It also read the access token straight out of localStorage.
 *
 * Net effect: an access token expiring mid-session surfaced as a chat error
 * with no refresh attempt, while the rest of the app silently recovered. The
 * user just saw the assistant stop working until they reloaded.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../../api/session', () => ({
  getAccessToken: vi.fn(),
  refreshAccessToken: vi.fn(),
}));
vi.mock('../../../../api/client', () => ({
  getActiveScopeHeader: () => null,
}));
vi.mock('../../../../api/aiChat', () => ({ aiChatApi: {} }));
vi.mock('../../../../config', () => ({ getApiBaseURL: () => 'http://api.test' }));

import { getAccessToken, refreshAccessToken } from '../../../../api/session';
import { IntegralNativeProvider } from '../IntegralNativeProvider';

function sseResponse(): Response {
  // Minimal body — these tests only care about the request/auth handshake.
  return new Response(new ReadableStream({ start: (c) => c.close() }), {
    status: 200,
    headers: { 'Content-Type': 'text/event-stream' },
  });
}

function ctx(overrides: Record<string, unknown> = {}) {
  return {
    threadId: 'thread-1',
    userMessageText: 'hello',
    abortSignal: new AbortController().signal,
    ...overrides,
  } as never;
}

async function drain(iter: AsyncIterable<unknown>): Promise<unknown[]> {
  const out: unknown[] = [];
  for await (const ev of iter) out.push(ev);
  return out;
}

describe('IntegralNativeProvider.streamTurn auth handling', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('sends and refreshes on HTTP without randomUUID, keeping one logical request ID', async () => {
    const entropy = globalThis.crypto;
    vi.stubGlobal('crypto', { getRandomValues: entropy.getRandomValues.bind(entropy) });
    vi.mocked(getAccessToken).mockReturnValue('expired');
    vi.mocked(refreshAccessToken).mockResolvedValue('fresh');
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response('nope', { status: 401 }))
      .mockResolvedValueOnce(sseResponse());
    vi.stubGlobal('fetch', fetchMock);
    try {
      const events = await drain(IntegralNativeProvider.streamTurn(ctx()));
      const first = JSON.parse(fetchMock.mock.calls[0][1].body).client_request_id;
      const second = JSON.parse(fetchMock.mock.calls[1][1].body).client_request_id;
      expect(first).toMatch(/^[\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/i);
      expect(second).toBe(first);
      expect(events).toEqual([]);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('reports missing browser entropy without throwing or submitting a write', async () => {
    vi.stubGlobal('crypto', undefined);
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    try {
      expect(await drain(IntegralNativeProvider.streamTurn(ctx()))).toEqual([
        expect.objectContaining({ type: 'error', code: 'request_id_unavailable' }),
      ]);
      expect(fetchMock).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('sends the token from the session module, not a raw localStorage read', async () => {
    vi.mocked(getAccessToken).mockReturnValue('access-1');
    const fetchMock = vi.fn().mockResolvedValue(sseResponse());
    vi.stubGlobal('fetch', fetchMock);

    await drain(IntegralNativeProvider.streamTurn(ctx()));

    expect(getAccessToken).toHaveBeenCalled();
    const headers = fetchMock.mock.calls[0][1].headers;
    expect(headers.Authorization).toBe('Bearer access-1');
  });

  it('refreshes and replays once on 401 instead of surfacing a chat error', async () => {
    vi.mocked(getAccessToken).mockReturnValue('expired');
    vi.mocked(refreshAccessToken).mockResolvedValue('fresh');
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response('nope', { status: 401 }))
      .mockResolvedValueOnce(sseResponse());
    vi.stubGlobal('fetch', fetchMock);

    const events = await drain(IntegralNativeProvider.streamTurn(ctx()));

    expect(refreshAccessToken).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1][1].headers.Authorization).toBe('Bearer fresh');
    const firstRequest = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    const replayedRequest = JSON.parse(fetchMock.mock.calls[1][1].body as string);
    expect(firstRequest.client_request_id).toMatch(/^[\da-f-]{36}$/i);
    expect(replayedRequest.client_request_id).toBe(firstRequest.client_request_id);
    // The retry succeeded, so the user sees no error event.
    expect(events.filter((e) => (e as { type?: string })?.type === 'error')).toEqual(
      [],
    );
  });

  it('does not retry when the refresh itself fails', async () => {
    vi.mocked(getAccessToken).mockReturnValue('expired');
    // null = genuinely unauthenticated; refreshAccessToken owns teardown.
    vi.mocked(refreshAccessToken).mockResolvedValue(null);
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response('nope', { status: 401 }));
    vi.stubGlobal('fetch', fetchMock);

    const events = await drain(IntegralNativeProvider.streamTurn(ctx()));

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const err = events.find((e) => (e as { type?: string })?.type === 'error') as {
      code?: string;
    };
    expect(err?.code).toBe('http_401');
  });

  it('does not attempt a refresh when the first call succeeds', async () => {
    vi.mocked(getAccessToken).mockReturnValue('good');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(sseResponse()));

    await drain(IntegralNativeProvider.streamTurn(ctx()));

    expect(refreshAccessToken).not.toHaveBeenCalled();
  });

  it('settles on the terminal frame even while the HTTP body remains open', async () => {
    vi.mocked(getAccessToken).mockReturnValue('good');
    const cancel = vi.fn();
    const encoder = new TextEncoder();
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        new ReadableStream({
          start(controller) {
            controller.enqueue(
              encoder.encode('event: text-delta\ndata: {"type":"text-delta","delta":"Done."}\n\n'),
            );
            controller.enqueue(
              encoder.encode('event: turn-settled\ndata: {"type":"turn-settled","status":"succeeded"}\n\n'),
            );
          },
          cancel,
        }),
        { status: 200, headers: { 'Content-Type': 'text/event-stream' } },
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    const events = (await drain(IntegralNativeProvider.streamTurn(ctx()))) as Array<{
      type?: string;
      delta?: string;
    }>;

    expect(events).toEqual([{ type: 'text-delta', delta: 'Done.' }]);
    expect(events.some((event) => event.type === 'turn-settled')).toBe(false);
    expect(cancel).toHaveBeenCalledTimes(1);
  });

  it('refuses a turn with no thread id', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const events = await drain(
      IntegralNativeProvider.streamTurn(ctx({ threadId: undefined })),
    );

    expect(fetchMock).not.toHaveBeenCalled();
    expect((events[0] as { code?: string })?.code).toBe('missing_thread_id');
  });
});
