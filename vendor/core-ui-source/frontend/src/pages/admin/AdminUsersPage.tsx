import { Button } from '../../components/ui';
import { Text, Input } from '../../ui';
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Search } from 'lucide-react';
import { adminApi } from '../../api/admin';
import {
  Avatar,
  Badge,
  LINE_ICON_STROKE,
  PageHeading,
  PageMeta,
  PageSection,
  PageShell,
  Skeleton,
} from '../../components/ui';
import { useSetCrumbs } from '../../context/CrumbsContext';
import { formatRelativeTime } from '../../utils';
import { AdminEntityLink } from '../../components/admin/AdminEntityLink';
import { adminQueryRecovery } from './adminQueryRecovery';

export function AdminUsersPage() {
  useSetCrumbs([
    { label: 'Admin', to: '/admin' },
    { label: 'Users' },
  ]);

  const [searchParams, setSearchParams] = useSearchParams();
  const page = Math.max(1, Number(searchParams.get('page') || '1'));
  const status = (searchParams.get('status') || 'all') as 'all' | 'active' | 'inactive';
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
    () => ['admin', 'users', page, status, debouncedSearch],
    [page, status, debouncedSearch],
  );

  const { data, isPending, error, refetch } = useQuery({
    queryKey,
    queryFn: () =>
      adminApi.listUsers({
        page,
        per_page: 20,
        search: debouncedSearch || undefined,
        status,
      }),
    ...adminQueryRecovery,
  });

  function setStatus(next: 'all' | 'active' | 'inactive') {
    const params = new URLSearchParams(searchParams);
    params.set('status', next);
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
        <PageHeading>Users</PageHeading>
        <PageMeta as="p">
          View and manage all platform users.
        </PageMeta>
      </PageSection>
      <PageSection className="mt-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative max-w-md flex-1">
            <Text as="span" tone="subtle" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2"><Search
              size={16}
              strokeWidth={LINE_ICON_STROKE}
              /></Text>
            <Input
              type="search"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search by name or email…"
              className="pl-9"
            />
          </div>
          <div className="flex gap-2">
            {(['all', 'active', 'inactive'] as const).map((s) => (
              <Button key={s} size="sm" variant={status === s ? 'primary' : 'ghost'}
                type="button" onClick={() => setStatus(s)} className="capitalize">{s}</Button>
            ))}
          </div>
        </div>
      </PageSection>
      <PageSection className="mt-6">
        {isPending && <Skeleton className="h-64 w-full rounded-xl" />}
        {error && (
          <p className="text-sm text-[var(--danger-text)]">
            Could not load users.{' '}
            <button type="button" className="underline" onClick={() => refetch()}>
              Retry
            </button>
          </p>
        )}
        {data && (
          <>
            <div className="overflow-x-auto rounded-xl border border-[var(--border-subtle)]">
              <table className="w-full min-w-[640px] text-sm">
                <thead>
                  <Text as="tr" variant="body" tone="subtle" className="border-b border-[var(--border-subtle)] text-left">
                    <th className="px-4 py-3 font-medium">User</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                    <th className="px-4 py-3 font-medium">Role</th>
                    <th className="px-4 py-3 font-medium">Created</th>
                    <th className="px-4 py-3 font-medium">Last active</th>
                  </Text>
                </thead>
                <tbody>
                  {data.users.map((user) => (
                    <tr
                      key={user.id}
                      className="border-b border-[var(--border-subtle)] last:border-0 hover:opacity-80"
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <Avatar name={user.display_name} size="sm" />
                          <div>
                            <AdminEntityLink
                              type="user"
                              id={user.id}
                              label={user.display_name || '—'}
                            />
                            <Text as="p" variant="body-sm" tone="muted" className="">{user.email || '—'}</Text>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant={user.is_active ? 'success' : 'danger'}>
                          {user.is_active ? 'Active' : 'Inactive'}
                        </Badge>
                      </td>
                      <td className="px-4 py-3">
                        {user.is_platform_admin ? (
                          <Badge variant="info">Super Admin</Badge>
                        ) : (
                          <Text as="span" variant="body" tone="muted" className="">Member</Text>
                        )}
                      </td>
                      <td className="px-4 py-3"><Text variant="body" tone="muted">
                        {user.created_at
                          ? formatRelativeTime(user.created_at)
                          : '—'}
                      </Text></td>
                      <td className="px-4 py-3"><Text variant="body" tone="muted">
                        {user.last_accessed
                          ? formatRelativeTime(user.last_accessed)
                          : '—'}
                      </Text></td>
                    </tr>
                  ))}
                  {data.users.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-4 py-8 text-center"><Text variant="body" tone="muted">
                        No users match your filters.
                      </Text></td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            {data.total_pages > 1 && (
              <Text as="div" variant="body" tone="muted" className="mt-4 flex items-center justify-between">
                <span>
                  Page {data.page} of {data.total_pages} ({data.total} total)
                </span>
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={!data.has_previous}
                    onClick={() => setPage(page - 1)}
                    className="rounded-lg px-3 py-1.5 disabled:opacity-40 hover:opacity-80"
                  >
                    Previous
                  </button>
                  <button
                    type="button"
                    disabled={!data.has_next}
                    onClick={() => setPage(page + 1)}
                    className="rounded-lg px-3 py-1.5 disabled:opacity-40 hover:opacity-80"
                  >
                    Next
                  </button>
                </div>
              </Text>
            )}
          </>
        )}
      </PageSection>
    </PageShell>
  );
}
