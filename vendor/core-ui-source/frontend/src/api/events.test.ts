import { afterEach, expect, it, vi } from 'vitest';
import apiClient from './client';
import { fetchEventsPage } from './events';

afterEach(() => vi.restoreAllMocks());

it('omits resource scope for permission-filtered selected-workspace recovery', async () => {
  const get = vi.spyOn(apiClient, 'get').mockResolvedValue({ data: { events: [], has_more: false } });
  await fetchEventsPage({ since: 'protected-workspace-cursor', limit: 50 });
  expect(get.mock.calls[0]).toStrictEqual(['/events', { params: { since: 'protected-workspace-cursor', limit: 50 } }]);
});

it('retains explicit resource narrowing for activity consumers', async () => {
  const get = vi.spyOn(apiClient, 'get').mockResolvedValue({ data: { events: [] } });
  await fetchEventsPage({ scope: 'track:chosen', actor_kind: 'human', limit: 20 });
  expect(get.mock.calls[0]).toStrictEqual(['/events', { params: { scope: 'track:chosen', actor_kind: 'human', limit: 20 } }]);
});
