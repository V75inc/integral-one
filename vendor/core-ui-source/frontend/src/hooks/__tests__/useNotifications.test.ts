/**
 * Phase 9 Plan 09-02 (NOTIF-01) — useNotifications() canonical hook tests.
 *
 * Three behaviors:
 *
 *  1. Hook returns { notifications, unreadCount, markRead, markAllRead, ... }
 *     and unreadCount matches the count of unread items.
 *
 *  2. After markRead(id), the query is invalidated and unreadCount decrements
 *     by 1 across a single React render cycle.
 *
 *  3. Two concurrent renderHook calls under the SAME QueryClientProvider
 *     share the cache — the API list endpoint is called once, both consumers
 *     observe the same notifications + unreadCount.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor, cleanup } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

afterEach(() => {
  cleanup();
});

// Mock the API client surface. Each test re-wires list / markRead / markAllRead.
vi.mock('../../api/notifications', () => ({
  notificationsApi: {
    list: vi.fn(),
    markRead: vi.fn(),
    markAllRead: vi.fn(),
  },
}));

import { notificationsApi } from '../../api/notifications';
import { useNotifications } from '../useNotifications';

interface MockNotification {
  id: string;
  read: boolean;
  user_id?: string;
  type?: string;
  message?: string;
  created_at?: string;
}

function listPayload(rows: MockNotification[], unreadCount?: number) {
  return {
    notifications: rows,
    total: rows.length,
    page: 1,
    per_page: 100,
    total_pages: 1,
    unread_count: unreadCount ?? rows.filter(n => !n.read).length,
  };
}

function makeWrapper() {
  const qc = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0, staleTime: 0 },
      mutations: { retry: false },
    },
  });
  const Wrapper = ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: qc }, children);
  return { qc, Wrapper };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('useNotifications()', () => {
  it('exposes notifications and unreadCount matching the unread items', async () => {
    const seed: MockNotification[] = [
      { id: 'n-1', read: false },
      { id: 'n-2', read: true },
      { id: 'n-3', read: false },
    ];
    (notificationsApi.list as ReturnType<typeof vi.fn>).mockResolvedValue(
      listPayload(seed),
    );

    const { Wrapper } = makeWrapper();
    const { result } = renderHook(() => useNotifications(), {
      wrapper: Wrapper,
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.notifications).toHaveLength(3);
    expect(result.current.unreadCount).toBe(2);
  });

  it('decrements unreadCount by 1 after markRead succeeds', async () => {
    const seed: MockNotification[] = [
      { id: 'n-1', read: false },
      { id: 'n-2', read: false },
    ];
    const after: MockNotification[] = [
      { id: 'n-1', read: true },
      { id: 'n-2', read: false },
    ];
    const listMock = notificationsApi.list as ReturnType<typeof vi.fn>;
    listMock
      .mockResolvedValueOnce(listPayload(seed))
      .mockResolvedValueOnce(listPayload(after));
    (notificationsApi.markRead as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { notification: after[0] },
    });

    const { Wrapper } = makeWrapper();
    const { result } = renderHook(() => useNotifications(), {
      wrapper: Wrapper,
    });

    await waitFor(() => expect(result.current.unreadCount).toBe(2));

    await act(async () => {
      await result.current.markRead('n-1');
    });

    await waitFor(() => expect(result.current.unreadCount).toBe(1));
    expect(notificationsApi.markRead).toHaveBeenCalledWith('n-1');
  });

  it('shares the cache across concurrent consumers (single API list call)', async () => {
    const seed: MockNotification[] = [{ id: 'n-1', read: false }];
    (notificationsApi.list as ReturnType<typeof vi.fn>).mockResolvedValue(
      listPayload(seed),
    );

    const { Wrapper } = makeWrapper();
    const hookA = renderHook(() => useNotifications(), { wrapper: Wrapper });
    const hookB = renderHook(() => useNotifications(), { wrapper: Wrapper });

    await waitFor(() => expect(hookA.result.current.isLoading).toBe(false));
    await waitFor(() => expect(hookB.result.current.isLoading).toBe(false));

    expect(hookA.result.current.unreadCount).toBe(1);
    expect(hookB.result.current.unreadCount).toBe(1);
    // Both consumers share the React Query cache — one network call.
    expect(notificationsApi.list).toHaveBeenCalledTimes(1);
  });

  it('markAllRead flips every notification to read after refetch', async () => {
    const seed: MockNotification[] = [
      { id: 'n-1', read: false },
      { id: 'n-2', read: false },
      { id: 'n-3', read: true },
    ];
    const after: MockNotification[] = seed.map(n => ({ ...n, read: true }));
    const listMock = notificationsApi.list as ReturnType<typeof vi.fn>;
    listMock
      .mockResolvedValueOnce(listPayload(seed))
      .mockResolvedValueOnce(listPayload(after));
    (notificationsApi.markAllRead as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { count: 2 },
    });

    const { Wrapper } = makeWrapper();
    const { result } = renderHook(() => useNotifications(), {
      wrapper: Wrapper,
    });

    await waitFor(() => expect(result.current.unreadCount).toBe(2));

    await act(async () => {
      await result.current.markAllRead();
    });

    await waitFor(() => expect(result.current.unreadCount).toBe(0));
    expect(notificationsApi.markAllRead).toHaveBeenCalled();
  });

  it('uses unread_count from the server payload', async () => {
    const seed: MockNotification[] = [
      { id: 'n-1', read: true },
      { id: 'n-2', read: true },
    ];
    (notificationsApi.list as ReturnType<typeof vi.fn>).mockResolvedValue(
      listPayload(seed, 7),
    );

    const { Wrapper } = makeWrapper();
    const { result } = renderHook(() => useNotifications(), {
      wrapper: Wrapper,
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.notifications).toHaveLength(2);
    expect(result.current.unreadCount).toBe(7);
  });
});
