/**
 * Phase 8 Plan 08-02 Task 3 — IS_CONNECTED_TO Track bindings panel (B1 closure).
 *
 * Mounted inline inside ConnectorEditModal. Lists every IS_CONNECTED_TO edge
 * between the connector and a Track; supports add (+ optional
 * mapping_profile_yaml + bidirectional) and unlink with a confirm gate.
 *
 * Per AGENTS.md jvspatial pillar #2: the binding's relationship metadata
 * lives on the edge — UI surface is read-through, never persists state in
 * a parent node field.
 *
 * Mutations invalidate BOTH `['connectors', connectorId, 'bindings']` AND
 * `['connectors', 'list']` (the latter so the parent panel re-renders if
 * any of its derived counters depend on binding state).
 */
import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link2, Loader2, Plus, Unlink } from 'lucide-react';

import {
  connectorsApi,
  type ConnectorBinding,
  type CreateConnectorBindingBody,
} from '../../../api/connectors';
import { tracksApi } from '../../../api/tracks';
import { Button } from '../../../components/ui/Button';
import { Skeleton } from '../../../components/ui/Skeleton';
import { useConfirm } from '../../../context/ConfirmContext';
import { useToast } from '../../../context/ToastContext';
import type { Track } from '../../../types';

interface Props {
  connectorId: string;
}

export function ConnectorBindingsPanel({ connectorId }: Props) {
  const qc = useQueryClient();
  const toast = useToast();
  const confirm = useConfirm();

  const [addOpen, setAddOpen] = useState(false);
  const [selectedTrackId, setSelectedTrackId] = useState('');
  const [yamlDraft, setYamlDraft] = useState('');
  const [bidirectional, setBidirectional] = useState(false);

  const bindingsQuery = useQuery({
    queryKey: ['connectors', connectorId, 'bindings'] as const,
    queryFn: () => connectorsApi.listBindings(connectorId),
    enabled: Boolean(connectorId),
  });

  const tracksQuery = useQuery({
    queryKey: ['tracks', 'list', 'for-bindings'] as const,
    queryFn: () => tracksApi.list(),
    enabled: addOpen,
  });

  const createMut = useMutation({
    mutationFn: (body: CreateConnectorBindingBody) =>
      connectorsApi.createBinding(connectorId, body),
    onSuccess: () => {
      qc.invalidateQueries({
        queryKey: ['connectors', connectorId, 'bindings'],
      });
      qc.invalidateQueries({ queryKey: ['connectors', 'list'] });
      toast.showToast('Track bound', 'success');
      setAddOpen(false);
      setSelectedTrackId('');
      setYamlDraft('');
      setBidirectional(false);
    },
    onError: (err: Error) => {
      toast.showToast(err.message || 'Failed to bind track', 'error');
    },
  });

  const deleteMut = useMutation({
    mutationFn: (trackId: string) =>
      connectorsApi.deleteBinding(connectorId, trackId),
    onSuccess: () => {
      qc.invalidateQueries({
        queryKey: ['connectors', connectorId, 'bindings'],
      });
      qc.invalidateQueries({ queryKey: ['connectors', 'list'] });
      toast.showToast('Track unbound', 'success');
    },
    onError: (err: Error) => {
      toast.showToast(err.message || 'Failed to unbind track', 'error');
    },
  });

  const bindings = useMemo(
    () => bindingsQuery.data?.bindings ?? [],
    [bindingsQuery.data],
  );

  // Filter out tracks already bound — regression guard against double-bind.
  const boundIds = useMemo(
    () => new Set(bindings.map(b => b.track_id)),
    [bindings],
  );
  const availableTracks: Track[] = useMemo(() => {
    const all = (tracksQuery.data ?? []) as Track[];
    return all.filter(t => !boundIds.has(t.id));
  }, [tracksQuery.data, boundIds]);

  const handleUnlink = async (binding: ConnectorBinding) => {
    const ok = await confirm({
      title: 'Unlink this Track binding?',
      message: `Removes the IS_CONNECTED_TO edge between this connector and ${binding.track_title || 'Untitled track'}.`,
      confirmLabel: 'Unlink',
      variant: 'danger',
    });
    if (!ok) return;
    deleteMut.mutate(binding.track_id);
  };

  const submitAdd = () => {
    if (!selectedTrackId) {
      toast.showToast('Select a track to bind', 'error');
      return;
    }
    createMut.mutate({
      track_id: selectedTrackId,
      mapping_profile_yaml: yamlDraft.trim() || undefined,
      bidirectional,
    });
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Link2 size={14} className="text-[var(--text-subtle)]" />
          <h3 className="text-sm font-semibold text-[var(--text)]">
            IS_CONNECTED_TO Track bindings
          </h3>
        </div>
        {!addOpen && (
          <Button
            type="button"
            variant="ghost"
            size="xs"
            icon={<Plus size={12} />}
            onClick={() => setAddOpen(true)}
            aria-label="Add binding"
          >
            Add binding
          </Button>
        )}
      </div>

      {bindingsQuery.isLoading ? (
        <Skeleton className="h-10 w-full" />
      ) : bindings.length === 0 ? (
        <p className="text-xs text-[var(--text-subtle)]">
          No track bindings yet. Bind a track so the sync runtime knows where
          to write external records.
        </p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {bindings.map(b => (
            <li
              key={b.track_id}
              className="flex items-center justify-between gap-2 rounded-[var(--radius-input)] border border-[var(--border-subtle)] bg-[var(--panel)] px-2.5 py-1.5"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs text-[var(--text)]">
                  {b.track_title || (
                    'Untitled track'
                  )}
                </p>
                <p className="truncate text-[10px] text-[var(--text-subtle)]">
                  workspace: {b.workspace_id || '—'}
                  {b.bidirectional ? ' · bidirectional' : ''}
                  {b.mapping_profile_yaml ? ' · mapped' : ''}
                </p>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="xs"
                icon={<Unlink size={12} />}
                onClick={() => handleUnlink(b)}
                aria-label={`Unlink ${b.track_id}`}
              >
                Unlink
              </Button>
            </li>
          ))}
        </ul>
      )}

      {addOpen && (
        <div className="flex flex-col gap-2 rounded-[var(--radius-card)] border border-[var(--panel-border)] bg-[var(--panel-2)] p-3">
          <label className="text-xs font-medium text-[var(--text)]">
            Track
          </label>
          <select
            value={selectedTrackId}
            onChange={e => setSelectedTrackId(e.target.value)}
            className="
              w-full rounded-[var(--radius-input)] border border-[var(--panel-border)]
              bg-[var(--panel)] px-2.5 py-1.5 text-xs text-[var(--text)]
            "
          >
            <option value="">— select a track —</option>
            {availableTracks.map(t => (
              <option key={t.id} value={t.id}>
                {t.title || 'Untitled track'}
              </option>
            ))}
          </select>

          <label className="text-xs font-medium text-[var(--text)]">
            Mapping profile (YAML)
          </label>
          <textarea
            value={yamlDraft}
            onChange={e => setYamlDraft(e.target.value)}
            rows={3}
            placeholder="Optional mapping YAML"
            className="
              w-full rounded-[var(--radius-input)] border border-[var(--panel-border)]
              bg-[var(--panel)] px-2.5 py-1.5 text-[11px] font-mono text-[var(--text)]
            "
          />

          <label className="flex items-center gap-2 text-xs text-[var(--text)]">
            <input
              type="checkbox"
              checked={bidirectional}
              onChange={e => setBidirectional(e.target.checked)}
            />
            Bidirectional
          </label>

          <div className="flex justify-end gap-2 pt-1">
            <Button
              type="button"
              variant="ghost"
              size="xs"
              onClick={() => {
                setAddOpen(false);
                setSelectedTrackId('');
                setYamlDraft('');
                setBidirectional(false);
              }}
              disabled={createMut.isPending}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="primary"
              size="xs"
              onClick={submitAdd}
              disabled={createMut.isPending}
            >
              {createMut.isPending ? (
                <Loader2 size={12} className="animate-spin" />
              ) : null}
              Bind
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
