import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Search } from 'lucide-react';
import { adminApi } from '../../api/admin';
import {
  Badge,
  LINE_ICON_STROKE,
  PageHeading,
  PageMeta,
  PageSection,
  PageShell,
  Skeleton,
} from '../../components/ui';
import { useSetCrumbs } from '../../context/CrumbsContext';
import { AdminEntityLink, AdminOwnerCell } from '../../components/admin/AdminEntityLink';
import { adminQueryRecovery } from './adminQueryRecovery';

export function AdminWorkspacesPage() {
  useSetCrumbs([
    { label: 'Admin', to: '/admin' },
    { label: 'Workspaces' },
  ]);

  const [searchParams, setSearchParams] = useSearchParams();
  const page = Math.max(1, Number(searchParams.get('page') || '1'));
  const kind = searchParams.get('kind') as 'personal' | 'organization' | null;
  const [searchInput, setSearchInput] = useState(searchParams.get('search') || '');
  const [debouncedSearch, setDebouncedSearch] = useState(searchInput);

  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedSearch(searchInput.trim()), 300);
    return () => window.clearTimeout(t);
  }, [searchInput]);

  useEffect(() => {
    const next = new URLSearchParams(searchParams);
    if (debouncedSearch) next.set('search', debouncedSearch);
    else next.delete('search');
    next.set('page', '1');
    setSearchParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch]);

  const queryKey = useMemo(
    () => ['admin', 'workspaces', page, kind, debouncedSearch],
    [page, kind, debouncedSearch],
  );

  const { data, isPending, error, refetch } = useQuery({
    queryKey,
    queryFn: () =>
      adminApi.listWorkspaces({
        page,
        per_page: 20,
        search: debouncedSearch || undefined,
        kind: kind || undefined,
      }),
    ...adminQueryRecovery,
  });

  function setKind(next: 'personal' | 'organization' | null) {
    const params = new URLSearchParams(searchParams);
    if (next) params.set('kind', next);
    else params.delete('kind');
    params.set('page', '1');
    setSearchParams(params);
  }

  function setPage(next: number) {
    const params = new URLSearchParams(searchParams);
    params.set('page', String(next));
    setSearchParams(params);
  }

  return (
    <PageShell>
      <PageSection>
        <PageHeading>Workspaces</PageHeading>
        <PageMeta as="p">
          All personal and collaborative workspaces.
        </PageMeta>
      </PageSection>
      <PageSection className="mt-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative max-w-md flex-1">
            <Search
              size={16}
              strokeWidth={LINE_ICON_STROKE}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-subtle)]"
            />
            <input
              type="search"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search workspaces…"
              className="w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--panel)] py-2 pl-9 pr-3 text-sm"
            />
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setKind(null)}
              className={[
                'rounded-lg px-3 py-1.5 text-xs',
                !kind ? 'bg-[var(--nav-active-bg)] font-medium' : 'text-[var(--text-muted)]',
              ].join(' ')}
            >
              All
            </button>
            <button
              type="button"
              onClick={() => setKind('personal')}
              className={[
                'rounded-lg px-3 py-1.5 text-xs',
                kind === 'personal' ? 'bg-[var(--nav-active-bg)] font-medium' : 'text-[var(--text-muted)]',
              ].join(' ')}
            >
              Personal
            </button>
            <button
              type="button"
              onClick={() => setKind('organization')}
              className={[
                'rounded-lg px-3 py-1.5 text-xs',
                kind === 'organization' ? 'bg-[var(--nav-active-bg)] font-medium' : 'text-[var(--text-muted)]',
              ].join(' ')}
            >
              Organization
            </button>
          </div>
        </div>
      </PageSection>
      <PageSection className="mt-6">
        {isPending && <Skeleton className="h-64 w-full rounded-xl" />}
        {error && (
          <p className="text-sm text-[var(--danger-text)]">
            Could not load workspaces.{' '}
            <button type="button" className="underline" onClick={() => refetch()}>Retry</button>
          </p>
        )}
        {data && (
          <>
            <div className="overflow-x-auto rounded-xl border border-[var(--border-subtle)]">
              <table className="w-full min-w-[640px] text-sm">
                <thead>
                  <tr className="border-b border-[var(--border-subtle)] text-left text-[var(--text-subtle)]">
                    <th className="px-4 py-3 font-medium">Name</th>
                    <th className="px-4 py-3 font-medium">Owner</th>
                    <th className="px-4 py-3 font-medium">Kind</th>
                    <th className="px-4 py-3 font-medium">Members</th>
                    <th className="px-4 py-3 font-medium">Apps</th>
                    <th className="px-4 py-3 font-medium">Tracks</th>
                  </tr>
                </thead>
                <tbody>
                  {data.workspaces.map((ws) => (
                    <tr key={ws.id} className="border-b border-[var(--border-subtle)] last:border-0 hover:bg-[var(--panel)]">
                      <td className="px-4 py-3">
                        <AdminEntityLink type="workspace" id={ws.id} label={ws.name || ws.id} />
                      </td>
                      <td className="px-4 py-3">
                        <AdminOwnerCell owner={ws.owner} />
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant={ws.kind === 'organization' ? 'info' : 'default'}>
                          {ws.kind || '—'}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-[var(--text-muted)]">{ws.member_count}</td>
                      <td className="px-4 py-3 text-[var(--text-muted)]">{ws.app_count}</td>
                      <td className="px-4 py-3 text-[var(--text-muted)]">{ws.track_count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {data.total_pages > 1 && (
              <div className="mt-4 flex items-center justify-between text-sm text-[var(--text-muted)]">
                <span>Page {data.page} of {data.total_pages}</span>
                <div className="flex gap-2">
                  <button type="button" disabled={!data.has_previous} onClick={() => setPage(page - 1)} className="rounded-lg px-3 py-1.5 disabled:opacity-40">Previous</button>
                  <button type="button" disabled={!data.has_next} onClick={() => setPage(page + 1)} className="rounded-lg px-3 py-1.5 disabled:opacity-40">Next</button>
                </div>
              </div>
            )}
          </>
        )}
      </PageSection>
    </PageShell>
  );
}
