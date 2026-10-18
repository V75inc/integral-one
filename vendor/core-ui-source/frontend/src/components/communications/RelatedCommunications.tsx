/**
 * Phase 19 EML-04 — Related communications inline projection.
 *
 * Renders the Email Thread entries linked to a Contact/Opportunity/Project
 * entry. Newest-first (sorted by custom_fields.last_message_at). Each row
 * shows subject + message_count + last_message_at. Click a row to open
 * the linked thread Entry detail.
 *
 * Manual "Link a communication" affordance: dispatches the manual link
 * mutation, optimistic insert + rollback on error.
 */

import { useCallback, useState, useMemo} from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  connectorsApi,
  type RelatedThreadSummary,
} from '../../api/connectors';
import { relatedCommunicationsQueryKey } from '../../queryKeys';
import { Text } from '../../ui';

export interface RelatedCommunicationsProps {
  entryId: string;
  /** Optional override of the navigation handler (e.g. router push). */
  onThreadClick?: (threadId: string) => void;
}

export function RelatedCommunications({
  entryId,
  onThreadClick,
}: RelatedCommunicationsProps) {
  const queryClient = useQueryClient();
  const [linkInputValue, setLinkInputValue] = useState('');
  const [linking, setLinking] = useState(false);
  const [mutationError, setMutationError] = useState('');

  const { data, isPending, error } = useQuery({
    queryKey: relatedCommunicationsQueryKey(entryId),
    queryFn: () => connectorsApi.listRelatedCommunications(entryId),
    staleTime: 30_000,
    retry: false,
  });

  const threads = useMemo(() => data?.threads ?? [], [data]);
  const loadError =
    error instanceof Error ? error.message : error ? 'Failed to load' : '';

  const invalidate = useCallback(async () => {
    await queryClient.invalidateQueries({
      queryKey: relatedCommunicationsQueryKey(entryId),
    });
  }, [queryClient, entryId]);

  const linkThread = useCallback(async () => {
    const threadId = linkInputValue.trim();
    if (!threadId) return;
    const optimistic: RelatedThreadSummary = {
      id: threadId,
      title: '(linking…)',
      subject: '',
      message_count: 0,
      last_message_at: new Date().toISOString(),
      gmail_thread_id: '',
      gmail_labels: [],
    };
    const before = threads;
    queryClient.setQueryData(relatedCommunicationsQueryKey(entryId), {
      threads: [optimistic, ...before],
    });
    setLinking(true);
    setMutationError('');
    try {
      await connectorsApi.linkRelatedCommunication(entryId, threadId);
      setLinkInputValue('');
      await invalidate();
    } catch (err) {
      queryClient.setQueryData(relatedCommunicationsQueryKey(entryId), {
        threads: before,
      });
      setMutationError(err instanceof Error ? err.message : 'Link failed');
    } finally {
      setLinking(false);
    }
  }, [entryId, linkInputValue, threads, queryClient, invalidate]);

  const unlink = useCallback(
    async (threadId: string) => {
      const before = threads;
      queryClient.setQueryData(relatedCommunicationsQueryKey(entryId), {
        threads: before.filter(t => t.id !== threadId),
      });
      setMutationError('');
      try {
        await connectorsApi.unlinkRelatedCommunication(entryId, threadId);
        await invalidate();
      } catch (err) {
        queryClient.setQueryData(relatedCommunicationsQueryKey(entryId), {
          threads: before,
        });
        setMutationError(err instanceof Error ? err.message : 'Unlink failed');
      }
    },
    [entryId, threads, queryClient, invalidate],
  );

  const displayError = mutationError || loadError;

  return (
    <div
      data-testid="related-communications-panel"
      className="rounded-md border border-[var(--panel-border)] p-4"
    >
      <Text variant="heading-sm">Related communications</Text>

      {isPending ? (
        <Text variant="meta" tone="muted" as="p" className="mt-2">
          Loading…
        </Text>
      ) : threads.length === 0 ? (
        <Text variant="meta" tone="muted" as="p" className="mt-2">
          No linked threads yet.
        </Text>
      ) : (
        <ul className="mt-2 flex flex-col gap-1">
          {threads.map(t => (
            <li
              key={t.id}
              className="flex items-center justify-between gap-2"
              data-testid={`related-thread-${t.id}`}
            >
              <button
                type="button"
                onClick={() => onThreadClick?.(t.id)}
                className="flex-1 text-left hover:opacity-80"
              >
                <Text variant="meta">
                  {t.subject || t.title || 'Untitled conversation'} · {t.message_count} msg ·{' '}
                  {t.last_message_at?.slice(0, 10) || ''}
                </Text>
              </button>
              <button
                type="button"
                onClick={() => unlink(t.id)}
                className="opacity-50 hover:opacity-100"
                aria-label={`Unlink ${t.subject || t.title || 'conversation'}`}
                data-testid={`related-unlink-${t.id}`}
              >
                <Text variant="meta">remove</Text>
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-3 flex items-center gap-2">
        <input
          type="text"
          placeholder="Thread Entry id…"
          value={linkInputValue}
          onChange={e => setLinkInputValue(e.target.value)}
          className="flex-1 rounded-md border border-[var(--panel-border)] px-2 py-1"
          data-testid="related-link-input"
        />
        <button
          type="button"
          onClick={linkThread}
          disabled={linking || !linkInputValue.trim()}
          className="rounded-md border border-[var(--panel-border)] px-3 py-1.5 hover:opacity-80 disabled:opacity-50"
          data-testid="related-link-button"
        >
          <Text variant="meta">{linking ? 'Linking…' : 'Link'}</Text>
        </button>
      </div>

      {displayError ? (
        <Text variant="meta" as="p" className="mt-2">
          {displayError}
        </Text>
      ) : null}
    </div>
  );
}
