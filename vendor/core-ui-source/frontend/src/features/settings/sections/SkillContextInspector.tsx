import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { skillsApi } from '../../../api/skills';
import { Button } from '../../../components/ui/Button';
import { EmptyState } from '../../../components/ui/EmptyState';
import { Skeleton } from '../../../components/ui/Skeleton';
import { Select, Stack, Surface, Text } from '../../../ui';

export function SkillPagination({
  page,
  pages,
  total,
  pageSize,
  busy,
  onPage,
  label,
}: {
  page: number;
  pages: number;
  total: number;
  pageSize: number;
  busy?: boolean;
  onPage: (page: number) => void;
  label: string;
}) {
  return (
    <nav
      aria-label={label}
      className="flex flex-wrap items-center justify-between gap-3 py-2"
    >
      <Text variant="meta" tone="muted">
        {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, total)} of{' '}
        {total}
      </Text>
      <div className="flex items-center gap-2">
        <Button
          variant="secondary"
          size="sm"
          className="min-h-11 min-w-11"
          disabled={busy || page <= 1}
          aria-label={`Previous ${label.toLowerCase()}`}
          onClick={() => onPage(page - 1)}
          icon={<ChevronLeft size={15} />}
        />
        <Text variant="meta" tone="muted">
          Page {page} of {pages}
        </Text>
        <Button
          variant="secondary"
          size="sm"
          className="min-h-11 min-w-11"
          disabled={busy || page >= pages}
          aria-label={`Next ${label.toLowerCase()}`}
          onClick={() => onPage(page + 1)}
          icon={<ChevronRight size={15} />}
        />
      </div>
    </nav>
  );
}

/** Mounted only on request: the runtime profile is deliberately absent from the initial page load. */
export function SkillContextInspector({
  workspaceId,
}: {
  workspaceId: string;
}) {
  const [focus, setFocus] = useState('');
  const [tab, setTab] = useState<'skills' | 'tools'>('skills');
  const [page, setPage] = useState(1);
  const query = useQuery({
    queryKey: ['effective-skills', workspaceId, focus],
    queryFn: () => skillsApi.effective(focus || null),
    staleTime: 30_000,
  });
  const data = query.data;
  const rows = tab === 'skills' ? (data?.skills ?? []) : (data?.tools ?? []);
  const pages = Math.max(1, Math.ceil(rows.length / 10));
  useEffect(() => {
    if (page > pages) setPage(pages);
  }, [page, pages]);
  const labels = {
    available: 'Available',
    offer_first: 'Ask first',
    paused: 'Paused',
    unavailable: 'Not loaded',
  };
  return (
    <Surface tone="panel-2" border="subtle" radius="card" padding="md">
      <Stack gap="md">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Text variant="body-sm" tone="muted">
            Inspect the skills and tools available in a conversation.
          </Text>
          <Select
            aria-label="App focus for agent context"
            value={focus}
            onChange={(event) => {
              setFocus(event.target.value);
              setPage(1);
            }}
          >
            <option value="">Workspace</option>
            {data?.apps.map((app) => (
              <option key={app.id} value={app.id}>
                {app.name}
              </option>
            ))}
          </Select>
        </div>
        <div className="flex gap-2" role="group" aria-label="Context type">
          <Button
            size="sm"
            variant={tab === 'skills' ? 'secondary' : 'ghost'}
            aria-pressed={tab === 'skills'}
            onClick={() => {
              setTab('skills');
              setPage(1);
            }}
          >
            Skills{data ? ` (${data.skills.length})` : ''}
          </Button>
          <Button
            size="sm"
            variant={tab === 'tools' ? 'secondary' : 'ghost'}
            aria-pressed={tab === 'tools'}
            onClick={() => {
              setTab('tools');
              setPage(1);
            }}
          >
            Tools{data ? ` (${data.tools.length})` : ''}
          </Button>
        </div>
        {query.isPending ? (
          <Skeleton className="h-24 w-full" />
        ) : query.isError ? (
          <EmptyState
            title="Could not load agent context"
            action={
              <Button variant="secondary" onClick={() => void query.refetch()}>
                Try again
              </Button>
            }
          />
        ) : (
          <>
            <ul
              aria-label="Agent context"
              className="divide-y divide-[var(--border-subtle)]"
            >
              {rows.slice((page - 1) * 10, page * 10).map((row, index) => (
                <li
                  key={'id' in row ? row.id : `${row.name}-${index}`}
                  className="flex items-start justify-between gap-3 py-3"
                >
                  <div className="min-w-0">
                    <Text
                      as="p"
                      variant="body-sm"
                      weight="medium"
                      className="break-words"
                    >
                      {row.name}
                    </Text>
                    <Text
                      as="p"
                      variant="meta"
                      tone="muted"
                      className="mt-1 line-clamp-2"
                    >
                      {'reason' in row && row.reason
                        ? row.reason
                        : row.description}
                    </Text>
                  </div>
                  {'state' in row ? (
                    <Text variant="meta" tone="muted" className="shrink-0">
                      {labels[row.state]}
                    </Text>
                  ) : null}
                </li>
              ))}
            </ul>
            {rows.length ? (
              <SkillPagination
                page={page}
                pages={pages}
                total={rows.length}
                pageSize={10}
                onPage={setPage}
                label="Agent context pages"
              />
            ) : (
              <Text variant="body-sm" tone="muted">
                No {tab} available here.
              </Text>
            )}
          </>
        )}
      </Stack>
    </Surface>
  );
}
