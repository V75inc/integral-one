import { PageMeta } from '../../../components/ui';
/**
 * Phase 8 Plan 08-02 Task 2 — Conflicts panel (SET-03).
 *
 * Mirrors backend GET /api/conflicts + GET /api/conflicts/{id} + POST
 * /api/conflicts/{id}/resolve. Lists pending Conflicts produced by the
 * connector sync runtime with manual_resolve policy; supports filter chips
 * (Open / Resolved / All) and a Resolve flow per row.
 *
 * Resolution Literal is the BACKEND set (`kept_local | applied_external |
 * merged`) per Phase 8 Research Pitfall 3 — NOT the ROADMAP misnomer. The
 * frontend never sends `accept_external` / `accept_local` / `merge_custom`.
 *
 * Conflict is a CORE node (not gated on the agentive flag), so this panel
 * does NOT show the AGENTIVE_ENABLED=off banner that Connectors does.
 */
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertOctagon } from 'lucide-react';
import { formatDistanceToNow, parseISO } from 'date-fns';

import {
  conflictsApi,
  type ConflictResponse,
} from '../../../api/conflicts';
import { Button } from '../../../components/ui/Button';
import { EmptyState } from '../../../components/ui/EmptyState';
import { SettingsSection } from '../components/Field';
import { Surface, Text } from '../../../ui';
import { AsyncBoundary } from '../../../patterns';
import { ResolveConflictModal } from './ResolveConflictModal';

type StatusFilter = 'open' | 'resolved' | 'all';

const CHIPS: { id: StatusFilter; label: string }[] = [
  { id: 'open', label: 'Open' },
  { id: 'resolved', label: 'Resolved' },
  { id: 'all', label: 'All' },
];

function formatDetected(iso: string | null): string {
  if (!iso) return 'unknown';
  try {
    return `${formatDistanceToNow(parseISO(iso))} ago`;
  } catch {
    return iso;
  }
}

function truncate(s: string, n: number): string {
  if (!s) return '';
  return s.length <= n ? s : `${s.slice(0, n)}…`;
}

export function ConflictsSection() {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('open');
  const [resolving, setResolving] = useState<ConflictResponse | null>(null);

  const list = useQuery({
    queryKey: ['conflicts', 'list', statusFilter] as const,
    queryFn: () =>
      conflictsApi.list(
        statusFilter === 'all' ? undefined : { status: statusFilter },
      ),
  });

  const conflicts = list.data?.conflicts ?? [];

  return (
    <div className="flex flex-col gap-5">
      <div>
        <Text variant="heading-md" weight="semibold" as="h2">Conflicts</Text>
        <PageMeta as="p">
          When a connector pulls in an update that clashes with a local
          edit, the disagreement lands here for review. Choose to keep your
          version, accept the external one, or mark it merged.
        </PageMeta>
      </div>

      <SettingsSection
        title="All conflicts"
        description="Filter by status. Each row shows when the conflict appeared and which connector and entry it affects."
        actions={
          <div className="flex items-center gap-1">
            {CHIPS.map(chip => (
              <button
                key={chip.id}
                type="button"
                onClick={() => setStatusFilter(chip.id)}
                aria-pressed={statusFilter === chip.id}
                className={`
                  rounded-[var(--radius-pill)] px-2 py-0.5 text-[10px] uppercase tracking-wide
                  ${
                    statusFilter === chip.id
                      ? 'bg-[var(--cta-bg)] text-[var(--cta-fg)]'
                      : 'bg-[var(--badge-muted-bg)] text-[var(--text-subtle)] hover:text-[var(--text)]'
                  }
                `}
              >
                {chip.label}
              </button>
            ))}
          </div>
        }
      >
        <AsyncBoundary
          query={list}
          isEmpty={(data) => (data.conflicts ?? []).length === 0}
          emptyFallback={
            <EmptyState
              icon={
                <AlertOctagon size={24} className="text-[var(--text-subtle)]" />
              }
              title={
                statusFilter === 'resolved'
                  ? 'No resolved conflicts yet.'
                  : statusFilter === 'open'
                    ? 'No open conflicts.'
                    : 'No conflicts on record.'
              }
              description="Conflicts appear here when an external update clashes with a local edit during sync."
            />
          }
          errorFallback={(err) => (
            <Text variant="body" tone="danger" as="p">
              Failed to load conflicts: {err.message}
            </Text>
          )}
        >
          {() => (
            <ul className="flex flex-col gap-2">
            {conflicts.map(c => (
              <Surface
                key={c.id}
                as="li"
                tone="panel-2"
                border="subtle"
                radius="card"
                padding="md"
                className="flex flex-col gap-2 sm:flex-row sm:items-stretch sm:gap-3"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="inline-flex rounded-[var(--radius-pill)] bg-[var(--badge-muted-bg)] px-2 py-0.5 text-[10px] uppercase tracking-wide text-[var(--text-subtle)]">
                      {c.status}
                    </span>
                    <Text variant="mono">
                      Connector {truncate(c.connector_id, 24)}
                    </Text>
                    <span className="font-mono text-xs text-[var(--text-subtle)]">
                      Entry {truncate(c.entry_id, 24)}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-[var(--text-subtle)]">
                    Detected {formatDetected(c.detected_at)}
                    {c.resolution ? ` · ${c.resolution}` : ''}
                  </p>
                </div>
                {c.status === 'open' && (
                  <div className="flex shrink-0 items-center gap-1 sm:flex-col sm:items-stretch">
                    <Button
                      type="button"
                      variant="primary"
                      size="xs"
                      onClick={() => setResolving(c)}
                      aria-label={`Resolve conflict ${c.id}`}
                    >
                      Resolve
                    </Button>
                  </div>
                )}
              </Surface>
            ))}
          </ul>
          )}
        </AsyncBoundary>
      </SettingsSection>

      <ResolveConflictModal
        open={resolving !== null}
        onClose={() => setResolving(null)}
        conflict={resolving}
      />
    </div>
  );
}
