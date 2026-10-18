import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useLifecycleWork } from '../useLifecycleWork';

const getWorkItem = vi.hoisted(() => vi.fn());

vi.mock('../../api/workItems', () => ({
  workItemsApi: { get: getWorkItem },
}));

const runningWork = {
  work_item_id: 'work_1',
  kind: 'app_lifecycle',
  status: 'running' as const,
  workspace_id: 'ws_1',
  app_id: '',
  attempt: 1,
  next_attempt_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
  result_refs: [],
};

describe('useLifecycleWork', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    getWorkItem.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  async function flushLifecyclePoll() {
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
  }

  it('reports the completed App only after durable work succeeds', async () => {
    const onSucceeded = vi.fn();
    const onFailed = vi.fn();
    getWorkItem.mockResolvedValue({
      ...runningWork,
      status: 'succeeded',
      result_refs: ['app:app_1'],
    });

    renderHook(() => useLifecycleWork('work_1', { onSucceeded, onFailed }));
    await flushLifecyclePoll();

    expect(onSucceeded).toHaveBeenCalledWith('app_1');
    expect(onFailed).not.toHaveBeenCalled();
  });

  it('keeps observing running work, then reports its durable failure', async () => {
    const onSucceeded = vi.fn();
    const onFailed = vi.fn();
    getWorkItem
      .mockResolvedValueOnce(runningWork)
      .mockResolvedValueOnce({
        ...runningWork,
        status: 'failed',
        failure: { code: 'dependency_unavailable', message: 'Dependency unavailable' },
      });

    renderHook(() => useLifecycleWork('work_1', { onSucceeded, onFailed }));
    await flushLifecyclePoll();
    expect(getWorkItem).toHaveBeenCalledTimes(1);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_500);
    });

    expect(onFailed).toHaveBeenCalledWith('Dependency unavailable');
    expect(onSucceeded).not.toHaveBeenCalled();
  });

  it('retries an observation error instead of manufacturing a failure', async () => {
    const onSucceeded = vi.fn();
    const onFailed = vi.fn();
    getWorkItem
      .mockRejectedValueOnce(new Error('network unavailable'))
      .mockResolvedValueOnce({
        ...runningWork,
        status: 'succeeded',
        app_id: 'app_2',
      });

    renderHook(() => useLifecycleWork('work_1', { onSucceeded, onFailed }));
    await flushLifecyclePoll();
    expect(getWorkItem).toHaveBeenCalledTimes(1);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_500);
    });

    expect(onSucceeded).toHaveBeenCalledWith('app_2');
    expect(onFailed).not.toHaveBeenCalled();
  });
});
