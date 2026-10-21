import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { blessStagingToken, getStagingTokenState, getPromptQueue, markPromptWrite, revokeStagingToken } from '../../../../api/agentive';
import { usePromptQueue } from '../usePromptQueue';

const state = vi.hoisted(() => ({ thread: 'thread-a', startRun: vi.fn(), append: vi.fn() }));
vi.mock('@assistant-ui/react', () => ({
  useThreadRuntime: () => ({ getState: () => ({ messages: [] }), startRun: state.startRun }),
}));
vi.mock('../../AIChatSurface', () => ({
  useChatActivity: () => ({ activeThreadId: state.thread, appendAssistantNote: (text: string) => state.append(text), isThreadStreaming: () => false }),
}));
vi.mock('../../../../context/ConfirmContext', () => ({ useConfirm: () => vi.fn() }));
vi.mock('../../../../api/agentive', () => ({
  getPromptQueue: vi.fn(), blessStagingToken: vi.fn(), cancelPromptQueueAll: vi.fn(),
  getStagingTokenState: vi.fn(), markPromptWrite: vi.fn(), resolvePromptQuestion: vi.fn(), revokeStagingToken: vi.fn(),
}));
const openQueue = (token = 'token-a') => ({ ok: true, open: true, queue: { status: 'open', items: [{ id: token, kind: 'staged_write', status: 'pending', token }] } });
const closedQueue = { ok: true, open: false, queue: { status: 'closed', items: [] } };

beforeEach(() => { vi.useFakeTimers(); state.thread = 'thread-a'; vi.mocked(getPromptQueue).mockResolvedValue(openQueue()); });
afterEach(() => { cleanup(); vi.useRealTimers(); vi.clearAllMocks(); });
async function settled() { await act(async () => { await Promise.resolve(); }); }

describe('approval queue refresh', () => {
  it('keeps an applied result distinct from a failed review refresh', async () => {
    vi.mocked(getStagingTokenState).mockResolvedValue({ requires_strong_confirmation: false } as never);
    vi.mocked(blessStagingToken).mockResolvedValue({ok: true, consumed: true, staged_change: {state: 'consumed'}, execute_result: {ok: true}} as never);
    vi.mocked(markPromptWrite).mockRejectedValueOnce({response: {status: 429, data: {message: 'Too many requests'}}});
    const {result} = renderHook(() => usePromptQueue()); await settled();
    await act(async () => { await result.current.approveWrite(); });
    expect(result.current.error).toMatch(/change was applied/);
    expect(result.current.error).toMatch(/do not approve it again/);
    expect(blessStagingToken).toHaveBeenCalledOnce();
  });
  it('observes a stale resolved approval on mount without starting a model run', async () => {
    vi.mocked(getPromptQueue).mockResolvedValue({...closedQueue, resume_text: "Change didn't go through", resume_required: true});
    renderHook(() => usePromptQueue()); await settled();
    expect(state.append).toHaveBeenCalledOnce();
    expect(state.startRun).not.toHaveBeenCalled();
  });
  it('closes a chat-resolved review and appends its receipt without another continuation', async () => {
    const { result } = renderHook(() => usePromptQueue()); await settled();
    vi.mocked(getPromptQueue).mockResolvedValueOnce({ ...closedQueue, resume_text: 'Updates applied', resume_required: false });
    await act(async () => { await result.current.refresh(); });
    await settled();
    expect(result.current.open).toBe(false);
    expect(state.append).toHaveBeenCalledTimes(1);
    expect(state.startRun).not.toHaveBeenCalled();
  });
  it('resumes a resolved review once across action/poll races, but permits identical wording for a new review', async () => {
    const { result } = renderHook(() => usePromptQueue()); await settled();
    vi.mocked(revokeStagingToken).mockResolvedValue({ ok: true });
    let resolveAction!: (value: Awaited<ReturnType<typeof markPromptWrite>>) => void;
    vi.mocked(markPromptWrite).mockImplementationOnce(() => new Promise((resolve) => { resolveAction = resolve; }));
    let rejection!: Promise<void>;
    await act(async () => { rejection = result.current.rejectWrite(); await Promise.resolve(); });
    const closed = { ...closedQueue, resume_text: 'No changes applied.', closed: true };
    vi.mocked(getPromptQueue).mockResolvedValueOnce(closed);
    await act(async () => { await result.current.refresh(); });
    await act(async () => { resolveAction({ ...closed, queue: { ...openQueue().queue, status: 'closed' } } as Awaited<ReturnType<typeof markPromptWrite>>); await rejection; });
    expect(state.append).toHaveBeenCalledTimes(1); expect(state.startRun).toHaveBeenCalledTimes(1);
    vi.mocked(getPromptQueue).mockResolvedValueOnce(openQueue('token-b'));
    await act(async () => { await result.current.refresh(); });
    vi.mocked(getPromptQueue).mockResolvedValueOnce(closed);
    await act(async () => { await result.current.refresh(); });
    expect(state.append).toHaveBeenCalledTimes(2); expect(state.startRun).toHaveBeenCalledTimes(1);
  });
  it('keeps the review on failure, honors backoff, and closes only on verified empty state', async () => {
    const { result } = renderHook(() => usePromptQueue());
    await settled(); expect(result.current.open).toBe(true);
    vi.mocked(getPromptQueue).mockRejectedValueOnce({ response: { status: 429, headers: { 'retry-after': '30' } } });
    await act(async () => { await result.current.refresh(); });
    expect(result.current.open).toBe(true); expect(result.current.current?.id).toBe('token-a');
    expect(result.current.error).toMatch(/current review is kept/);
    await act(async () => { await result.current.refresh(); }); expect(getPromptQueue).toHaveBeenCalledTimes(2);
    vi.mocked(getPromptQueue).mockResolvedValue(closedQueue); vi.setSystemTime(Date.now() + 31000);
    await act(async () => { await result.current.refresh(); });
    expect(result.current.open).toBe(false); expect(result.current.error).toBeNull(); expect(state.startRun).not.toHaveBeenCalled();
  });
  it('does not rebuild polling when runtime handles or activity callbacks change', async () => {
    const { rerender } = renderHook(() => usePromptQueue()); await settled();
    for (let index = 0; index < 20; index += 1) rerender();
    await settled(); expect(getPromptQueue).toHaveBeenCalledTimes(1);
  });
  it('coalesces requests and ignores results from an earlier conversation', async () => {
    let resolveOld!: (value: ReturnType<typeof openQueue>) => void;
    vi.mocked(getPromptQueue).mockImplementationOnce(() => new Promise((resolve) => { resolveOld = resolve; }));
    const { result, rerender } = renderHook(() => usePromptQueue());
    await settled();
    await act(async () => { await result.current.refresh(); }); expect(getPromptQueue).toHaveBeenCalledTimes(1);
    state.thread = 'thread-b'; vi.mocked(getPromptQueue).mockResolvedValue(openQueue('token-b')); rerender(); await settled();
    expect(result.current.current?.id).toBe('token-b');
    await act(async () => { resolveOld(openQueue('token-a')); }); expect(result.current.current?.id).toBe('token-b');
  });
});

it.each(['approveWrite', 'rejectWrite'] as const)('records a terminal card decision without a model run: %s', async (action) => {
  vi.mocked(getStagingTokenState).mockResolvedValue({requires_strong_confirmation: false} as never);
  vi.mocked(blessStagingToken).mockResolvedValue({ok: true, consumed: true, staged_change: {state: 'consumed'}, execute_result: {ok: true}} as never);
  vi.mocked(revokeStagingToken).mockResolvedValue({ok: true});
  vi.mocked(markPromptWrite).mockResolvedValue({...closedQueue, closed: true, resume_text: 'Review completed', resume_required: false} as never);
  const {result} = renderHook(() => usePromptQueue()); await settled();
  vi.mocked(getPromptQueue).mockResolvedValue(closedQueue as Awaited<ReturnType<typeof getPromptQueue>>);
  await act(async () => { await result.current[action](); });
  expect(result.current.open).toBe(false);
  expect(state.append).toHaveBeenCalledOnce();
  expect(state.startRun).not.toHaveBeenCalled();
});

it('refreshes again when a committed staging signal arrives during an earlier read', async () => {
  let resolveOld!: (value: Awaited<ReturnType<typeof getPromptQueue>>) => void;
  vi.mocked(getPromptQueue).mockImplementationOnce(() => new Promise(resolve => { resolveOld = resolve; }));
  vi.mocked(getPromptQueue).mockResolvedValue(openQueue('committed-card'));
  const {result} = renderHook(() => usePromptQueue()); await settled();
  expect(getPromptQueue).toHaveBeenCalledOnce();
  await act(async () => {
    window.dispatchEvent(new CustomEvent('integral:prompt-queue-refresh', {detail: {threadId: 'thread-a'}}));
    resolveOld(closedQueue as Awaited<ReturnType<typeof getPromptQueue>>);
  });
  await settled();
  expect(getPromptQueue).toHaveBeenCalledTimes(2);
  expect(result.current.current?.id).toBe('committed-card');
});
