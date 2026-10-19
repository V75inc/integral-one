/**
 * Phase 8 Plan 08-02 — Conflict resolve modal.
 *
 * Mirrors backend POST /api/conflicts/{id}/resolve. Resolution Literal
 * follows the BACKEND set `kept_local | applied_external | merged` per
 * Phase 8 Research Pitfall 3 — the ROADMAP misnomer set is NOT used.
 *
 * Snapshots are rendered with `<pre>{JSON.stringify(o, null, 2)}</pre>` —
 * NEVER `dangerouslySetInnerHTML`. The Conflict.local_snapshot /
 * external_snapshot fields are untrusted external content; the React JSX
 * escape boundary is the XSS mitigation.
 *
 * Migrated to FormDialog template (Phase 6) — multi-action footer rendered
 * via the `actions` slot override.
 */
import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';

import {
  conflictsApi,
  type ConflictResolution,
  type ConflictResponse,
} from '../../../api/conflicts';
import { Button } from '../../../components/ui/Button';
import { Skeleton } from '../../../components/ui/Skeleton';
import { Text } from '../../../ui';
import { FormDialog } from '../../../templates';
import { useToast } from '../../../context/ToastContext';

interface Props {
  open: boolean;
  onClose: () => void;
  conflict: ConflictResponse | null;
}

export function ResolveConflictModal({ open, onClose, conflict }: Props) {
  const qc = useQueryClient();
  const toast = useToast();
  const [selected, setSelected] = useState<ConflictResolution | null>(null);

  // Re-fetch the full Conflict (the list endpoint may return a trimmed shape).
  const detail = useQuery({
    queryKey: ['conflicts', 'get', conflict?.id] as const,
    queryFn: () => conflictsApi.get(conflict!.id),
    enabled: Boolean(open && conflict?.id),
  });

  useEffect(() => {
    if (!open) setSelected(null);
  }, [open]);

  const mut = useMutation({
    mutationFn: ({
      id,
      resolution,
    }: {
      id: string;
      resolution: ConflictResolution;
    }) => conflictsApi.resolve(id, resolution),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['conflicts'] });
      toast.showToast('Conflict resolved', 'success');
      onClose();
    },
    onError: (err: Error) => {
      toast.showToast(err.message || 'Failed to resolve conflict', 'error');
    },
  });

  const trigger = (resolution: ConflictResolution) => {
    if (!conflict) return;
    setSelected(resolution);
    mut.mutate({ id: conflict.id, resolution });
  };

  if (!conflict) return null;
  const full = detail.data ?? conflict;

  const actions = (
    <>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={onClose}
        disabled={mut.isPending}
      >
        Cancel
      </Button>
      <Button
        type="button"
        variant="secondary"
        size="sm"
        onClick={() => trigger('kept_local')}
        disabled={mut.isPending}
      >
        {mut.isPending && selected === 'kept_local' ? (
          <Loader2 size={14} className="animate-spin" />
        ) : null}
        Keep local
      </Button>
      <Button
        type="button"
        variant="secondary"
        size="sm"
        onClick={() => trigger('merged')}
        disabled={mut.isPending}
      >
        {mut.isPending && selected === 'merged' ? (
          <Loader2 size={14} className="animate-spin" />
        ) : null}
        Mark merged
      </Button>
      <Button
        type="button"
        variant="primary"
        size="sm"
        onClick={() => trigger('applied_external')}
        disabled={mut.isPending}
      >
        {mut.isPending && selected === 'applied_external' ? (
          <Loader2 size={14} className="animate-spin" />
        ) : null}
        Apply external
      </Button>
    </>
  );

  return (
    <FormDialog
      open={open}
      onClose={onClose}
      title={`Resolve conflict — ${conflict.id}`}
      actions={actions}
    >
      <Text variant="body-sm" tone="subtle" as="p">
        Connector:{' '}
        <Text variant="mono" tone="default">
          {full.connector_id}
        </Text>{' '}
        · Entry:{' '}
        <Text variant="mono" tone="default">
          {full.entry_id}
        </Text>
      </Text>

      {detail.isLoading ? (
        <Skeleton className="h-32 w-full" />
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <div>
            <Text variant="meta" weight="semibold" as="h4" className="mb-1 uppercase tracking-wide">
              Local snapshot
            </Text>
            <pre className="max-h-64 overflow-auto rounded-[var(--radius-input)] border border-[var(--panel-border)] bg-[var(--panel)] p-2 text-[11px] font-mono text-[var(--text)]">
              {JSON.stringify(full.local_snapshot ?? {}, null, 2)}
            </pre>
          </div>
          <div>
            <Text variant="meta" weight="semibold" as="h4" className="mb-1 uppercase tracking-wide">
              External snapshot
            </Text>
            <pre className="max-h-64 overflow-auto rounded-[var(--radius-input)] border border-[var(--panel-border)] bg-[var(--panel)] p-2 text-[11px] font-mono text-[var(--text)]">
              {JSON.stringify(full.external_snapshot ?? {}, null, 2)}
            </pre>
          </div>
        </div>
      )}
    </FormDialog>
  );
}
