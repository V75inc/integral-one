import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('../../../../api/session', () => ({ getAccessToken: () => 'token', refreshAccessToken: vi.fn() }));
vi.mock('../../../../api/client', () => ({ getActiveScopeHeader: () => 'ws:workspace' }));
vi.mock('../../../../api/aiChat', () => ({ aiChatApi: {} }));
vi.mock('../../../../config', () => ({ getApiBaseURL: () => 'http://api.test' }));
import { IntegralNativeProvider } from '../IntegralNativeProvider';
import { createServerChatProvider } from '../ServerChatProvider';
function response(frames: string, accepted = false) {
  return new Response(frames, { headers: { 'Content-Type': 'text/event-stream', ...(accepted ? { 'X-Integral-Work-Item': 'chat-turn:saved' } : {}) } });
}
const frame = (sequence: number, delta: string) => `id: ${sequence}\nevent: text-delta\ndata: ${JSON.stringify({ type: 'text-delta', delta })}\n\n`;
const settled = 'event: turn-settled\ndata: {"status":"succeeded"}\n\n';
async function drain(provider = IntegralNativeProvider) {
  const result: unknown[] = [];
  for await (const event of provider.streamTurn({ threadId: 'thread', userMessageText: 'hello', abortSignal: new AbortController().signal } as never)) result.push(event);
  return result;
}
describe('native committed response replay', () => {
  beforeEach(() => vi.clearAllMocks());
  it('reconnects with GET from the cursor and suppresses duplicate events', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(response(frame(1, 'First'), true)).mockResolvedValueOnce(response(frame(1, 'First') + frame(2, 'Second') + settled));
    vi.stubGlobal('fetch', fetchMock);
    expect(await drain()).toEqual([{ type: 'text-delta', delta: 'First' }, { type: 'text-delta', delta: 'Second' }]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0][1].method).toBe('POST');
    expect(fetchMock.mock.calls[1][1].method).toBe('GET');
    expect(fetchMock.mock.calls[1][0]).toContain('/work-items/chat-turn%3Asaved/stream?after_sequence=1');
    expect(fetchMock.mock.calls[1][1].headers['X-Integral-Scope']).toBe('ws:workspace');
  });
  it('fails closed on a sequence gap', async () => {
    const fetchMock = vi.fn().mockResolvedValue(response(frame(2, 'Must not display'), true));
    vi.stubGlobal('fetch', fetchMock);
    expect(await drain()).toEqual([expect.objectContaining({ code: 'chat_event_sequence_gap' })]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it('bounds reconnect attempts without resubmitting accepted work', async () => {
    const fetchMock = vi.fn().mockResolvedValue(response('', true));
    vi.stubGlobal('fetch', fetchMock);
    expect(await drain()).toEqual([expect.objectContaining({ code: 'chat_reconnect_exhausted' })]);
    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(fetchMock.mock.calls.slice(1).every(call => call[1].method === 'GET')).toBe(true);
  });
  it('rejects output without a committed event ID', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response('event: text-delta\ndata: {"type":"text-delta","delta":"Uncommitted"}\n\n', true)));
    expect(await drain()).toEqual([expect.objectContaining({ code: 'chat_event_sequence_invalid' })]);
  });
  it('attaches directly to an owned work receipt after reload without POST', async () => {
    const fetchMock = vi.fn().mockResolvedValue(response(frame(1, 'Recovered') + settled));
    vi.stubGlobal('fetch', fetchMock);
    const events = [];
    for await (const event of IntegralNativeProvider.streamTurn({threadId: 'thread', userMessageText: '', resumeWorkItemId: 'chat-turn:owned', abortSignal: new AbortController().signal})) events.push(event);
    expect(events).toEqual([{type: 'text-delta', delta: 'Recovered'}]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][1].method).toBe('GET');
    expect(fetchMock.mock.calls[0][1].body).toBeUndefined();
    expect(fetchMock.mock.calls[0][0]).toContain('/work-items/chat-turn%3Aowned/stream?after_sequence=0');
  });
  it('does not reconnect a provider without receipt support with a receipt header', async () => {
    const fetchMock = vi.fn().mockResolvedValue(response(frame(1, 'Legacy'), true));
    vi.stubGlobal('fetch', fetchMock);
    expect(await drain(createServerChatProvider({ id: 'test-provider', label: 'Test', capabilities: IntegralNativeProvider.capabilities }))).toEqual([{ type: 'text-delta', delta: 'Legacy' }]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
