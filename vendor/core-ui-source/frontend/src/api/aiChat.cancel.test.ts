import { afterEach, describe, expect, it, vi } from 'vitest';
const client = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock('./index', () => ({ apiClient: client }));
import { aiChatApi } from './aiChat';
afterEach(() => {
  vi.useRealTimers();
  vi.resetAllMocks();
});
describe('acknowledged thread cancellation', () => {
  it('waits for the observed turn to release admission', async () => {
    vi.useFakeTimers();
    client.post.mockResolvedValue({
      data: { cancelled: true, work_item_id: 'old' },
    });
    client.get
      .mockResolvedValueOnce({ data: { running: true, work_item_id: 'old' } })
      .mockResolvedValueOnce({ data: { running: true, work_item_id: 'old' } })
      .mockResolvedValueOnce({ data: { running: false } });
    const done = vi.fn();
    const pending = aiChatApi.cancelThread('thread').then(done);
    await vi.advanceTimersByTimeAsync(499);
    expect(done).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    await pending;
    expect(done).toHaveBeenCalledOnce();
  });
  it('does not wait for or cancel a newer turn', async () => {
    client.post.mockResolvedValue({
      data: { cancelled: true, turn_id: 'old' },
    });
    client.get
      .mockResolvedValueOnce({ data: { running: true, turn_id: 'old' } })
      .mockResolvedValue({ data: { running: true, turn_id: 'new' } });
    await aiChatApi.cancelThread('thread');
    expect(client.post).toHaveBeenCalledOnce();
    expect(client.get).toHaveBeenCalledTimes(2);
  });
  it('reports a bounded timeout instead of pretending work stopped', async () => {
    vi.useFakeTimers();
    client.post.mockResolvedValue({
      data: { cancelled: true, turn_id: 'old' },
    });
    client.get.mockResolvedValue({ data: { running: true, turn_id: 'old' } });
    const pending = expect(aiChatApi.cancelThread('thread')).rejects.toThrow(
      'Stopping is taking longer',
    );
    await vi.advanceTimersByTimeAsync(30_000);
    await pending;
  });
  it('propagates cancellation failure without polling for completion', async () => {
    client.get.mockResolvedValue({ data: { running: true, turn_id: 'old' } });
    client.post.mockRejectedValue(new Error('Unavailable'));
    await expect(aiChatApi.cancelThread('thread')).rejects.toThrow(
      'Unavailable',
    );
    expect(client.get).toHaveBeenCalledOnce();
  });
  it('retains the observed target for retries after a network failure', async () => {
    client.get.mockResolvedValue({
      data: { running: true, work_item_id: 'original' },
    });
    client.post.mockRejectedValueOnce(new Error('Unavailable'));
    const onTarget = vi.fn();
    await expect(
      aiChatApi.cancelThread('thread', null, onTarget),
    ).rejects.toThrow('Unavailable');
    const target = onTarget.mock.calls[0][0];
    client.post.mockResolvedValue({
      data: { thread_id: 'thread', cancelled: false },
    });
    await aiChatApi.cancelThread('thread', target);
    expect(client.post.mock.calls[1][1]).toEqual({
      expected_work_item_id: 'original',
      expected_turn_id: undefined,
    });
    expect(client.get).toHaveBeenCalledOnce();
  });
  it('accepts confirmed idle without sending cancellation', async () => {
    client.get.mockResolvedValue({ data: { running: false } });
    await expect(aiChatApi.cancelThread('thread')).resolves.toMatchObject({
      cancelled: true,
    });
    expect(client.post).not.toHaveBeenCalled();
  });
  it('refuses malformed activity instead of declaring completion', async () => {
    client.get.mockResolvedValue({ data: {} });
    await expect(aiChatApi.cancelThread('thread')).rejects.toThrow(
      'Could not confirm',
    );
    expect(client.post).not.toHaveBeenCalled();
  });
});

it('backs off polling while waiting for durable cancellation', async () => {
  vi.useFakeTimers();
  client.post.mockResolvedValue({
    data: { cancelled: true, work_item_id: 'old' },
  });
  client.get.mockResolvedValue({
    data: { running: true, work_item_id: 'old' },
  });
  const pending = expect(aiChatApi.cancelThread('thread')).rejects.toThrow(
    'Stopping is taking longer',
  );
  await vi.advanceTimersByTimeAsync(30_000);
  await pending;
  // One target read plus at most 18 completion reads, including the deadline.
  expect(client.get.mock.calls.length).toBeLessThanOrEqual(19);
  expect(client.post).toHaveBeenCalledOnce();
});
