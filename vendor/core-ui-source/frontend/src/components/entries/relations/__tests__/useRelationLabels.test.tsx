/**
 * useRelationLabels Vitest — shared resolver for relation field values.
 *
 * Covers:
 *  - resolves a single entry id to a labeled target
 *  - resolves an array of entry ids
 *  - resolves track ids when relation.target === 'track'
 *  - falls back to "Entry XXXXXX" on fetch failure
 *  - returns empty targets for null/undefined value
 *  - dedupes fetches across two mounted hooks sharing one id
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, renderHook, screen, waitFor, cleanup, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import '@testing-library/jest-dom/vitest';

import { useRelationLabels } from '../useRelationLabels';
import apiClient from '../../../../api/client';

// useRelationLabels resolves ids through relationTargetLoader, which batches
// every id requested in a tick into one POST /entry-lookup via apiClient —
// it never calls entriesApi/tracksApi directly, so mocking those (as this
// file used to) mocks the wrong boundary and every fetch silently falls
// through to the id-suffix fallback label instead of the mocked title.
vi.mock('../../../../api/client', () => ({
  default: { post: vi.fn() },
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function makeClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
}

function HookHarness({
  value,
  relation,
  testId = 'out',
}: {
  value: unknown;
  relation: { target?: 'entry' | 'track'; allow_cross_track?: boolean } | undefined;
  testId?: string;
}) {
  const { targets, loading } = useRelationLabels(value, relation);
  return (
    <div data-testid={testId} data-loading={loading ? '1' : '0'}>
      {targets.map(t => `${t.kind}:${t.id}=${t.label}`).join('|')}
    </div>
  );
}

type PostMock = ReturnType<typeof vi.fn>;

describe('useRelationLabels', () => {
  beforeEach(() => {
    (apiClient.post as PostMock).mockImplementation(
      async (_url: string, body: { ids: string[]; kind: 'entry' | 'track' }) => ({
        data: {
          targets: body.ids.map(id =>
            body.kind === 'track'
              ? { id, title: `Track ${id}` }
              : { id, title: `Entry ${id}`, body: '', track_id: 'track-xyz' }
          ),
        },
      })
    );
  });

  it('keeps empty labels stable across renders, including equivalent inputs', () => {
    const client = makeClient();
    const { result, rerender } = renderHook(
      ({ value }: { value: unknown }) => useRelationLabels(value, undefined),
      { initialProps: { value: undefined as unknown }, wrapper: ({ children }) =>
        <QueryClientProvider client={client}>{children}</QueryClientProvider> },
    );
    const initial = result.current.targets;
    rerender({ value: undefined });
    expect(result.current.targets).toBe(initial);
    rerender({ value: [] });
    expect(result.current.targets).toBe(initial);
  });

  it('keeps resolved labels stable and publishes actual cache changes', async () => {
    const client = makeClient();
    const { result, rerender } = renderHook(
      ({ value }) => useRelationLabels(value, { target: 'entry' }),
      { initialProps: { value: ['stable-id'] }, wrapper: ({ children }) =>
        <QueryClientProvider client={client}>{children}</QueryClientProvider> },
    );
    await waitFor(() => expect(result.current.loading).toBe(false));
    const initial = result.current.targets;
    rerender({ value: ['stable-id'] });
    expect(result.current.targets).toBe(initial);
    act(() => client.setQueryData(['relation-target', 'entry', 'stable-id'], {
      id: 'stable-id', label: 'Updated title', kind: 'entry', trackId: 'track-xyz',
    }));
    await waitFor(() => expect(result.current.targets[0].label).toBe('Updated title'));
    expect(result.current.targets).not.toBe(initial);
  });

  it('resolves a single entry id', async () => {
    const client = makeClient();
    render(
      <QueryClientProvider client={client}>
        <HookHarness value="entry-a" relation={{ target: 'entry' }} />
      </QueryClientProvider>
    );
    await waitFor(() =>
      expect(screen.getByTestId('out')).toHaveTextContent('entry:entry-a=Entry entry-a')
    );
  });

  it('resolves an array of entry ids', async () => {
    const client = makeClient();
    render(
      <QueryClientProvider client={client}>
        <HookHarness value={['e1', 'e2']} relation={{ target: 'entry' }} />
      </QueryClientProvider>
    );
    await waitFor(() => {
      const text = screen.getByTestId('out').textContent || '';
      expect(text).toContain('entry:e1=Entry e1');
      expect(text).toContain('entry:e2=Entry e2');
    });
  });

  it('resolves track ids when relation.target === track', async () => {
    const client = makeClient();
    render(
      <QueryClientProvider client={client}>
        <HookHarness value="t-1" relation={{ target: 'track' }} />
      </QueryClientProvider>
    );
    await waitFor(() =>
      expect(screen.getByTestId('out')).toHaveTextContent('track:t-1=Track t-1')
    );
    expect((apiClient.post as PostMock).mock.calls[0][1]).toMatchObject({ kind: 'track' });
  });

  it('falls back to "Entry XXXXXX" on fetch failure', async () => {
    (apiClient.post as PostMock).mockRejectedValue(new Error('boom'));
    const client = makeClient();
    render(
      <QueryClientProvider client={client}>
        <HookHarness value="bad-id-abcdef" relation={{ target: 'entry' }} />
      </QueryClientProvider>
    );
    await waitFor(() =>
      expect(screen.getByTestId('out')).toHaveTextContent('entry:bad-id-abcdef=Entry abcdef')
    );
  });

  it('returns empty targets for null/undefined value', () => {
    const client = makeClient();
    render(
      <QueryClientProvider client={client}>
        <HookHarness value={null} relation={{ target: 'entry' }} />
      </QueryClientProvider>
    );
    expect(screen.getByTestId('out')).toHaveTextContent('');
    expect(screen.getByTestId('out').dataset.loading).toBe('0');
  });

  it('dedupes fetches across two hooks sharing one id', async () => {
    const client = makeClient();
    render(
      <QueryClientProvider client={client}>
        <HookHarness value="shared-id" relation={{ target: 'entry' }} testId="a" />
        <HookHarness value="shared-id" relation={{ target: 'entry' }} testId="b" />
      </QueryClientProvider>
    );
    await waitFor(() => {
      expect(screen.getByTestId('a')).toHaveTextContent('Entry shared-id');
      expect(screen.getByTestId('b')).toHaveTextContent('Entry shared-id');
    });
    expect((apiClient.post as PostMock).mock.calls.length).toBe(1);
  });
});
