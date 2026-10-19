import { useEffect, useState } from 'react';

import { entryTypesApi } from '../../../../api/entryTypes';

interface Track {
  id: string;
  title: string;
}

interface EntryType {
  id: string;
  name: string;
}

interface RelationConfigProps {
  mode: 'lookup' | 'anchor';
  targetTrackId: string;
  targetEntryTypeId: string;   // only used in lookup mode
  many: boolean;
  tracks: Track[];
  onChangeMode: (mode: 'lookup' | 'anchor') => void;
  onChangeTargetTrack: (id: string) => void;
  onChangeTargetEntryType: (id: string) => void;
  onChangeMany: (many: boolean) => void;
}

export function RelationConfig({
  mode, targetTrackId, targetEntryTypeId, many,
  tracks, onChangeMode, onChangeTargetTrack,
  onChangeTargetEntryType, onChangeMany,
}: RelationConfigProps) {
  const [entryTypes, setEntryTypes] = useState<EntryType[]>([]);

  // Load entry types for the selected track whenever targetTrackId changes
  // and we're in lookup mode
  useEffect(() => {
    if (!targetTrackId || mode !== 'lookup') {
      setEntryTypes([]);
      return;
    }
    // Was a raw fetch with a hand-rolled Bearer read straight from
    // localStorage. That bypassed the whole apiClient stack: no 401 → refresh
    // → retry, no X-Integral-Scope header, and no error surfacing. It also had
    // no cancellation, so switching target tracks quickly let a stale response
    // overwrite the newer one.
    let cancelled = false;
    entryTypesApi
      .list({ track_id: targetTrackId })
      .then(types => {
        if (cancelled) return;
        setEntryTypes(types.map(e => ({ id: e.id, name: e.name })));
      })
      .catch(() => {
        if (!cancelled) setEntryTypes([]);
      });
    return () => {
      cancelled = true;
    };
  }, [targetTrackId, mode]);

  return (
    <div className="space-y-3">
      {/* Mode selector */}
      <div>
        <label className="text-xs font-medium text-[var(--text-muted)]">
          Relation type
        </label>
        <div className="mt-1.5 flex rounded-[var(--radius-input)] border border-[var(--panel-border)] overflow-hidden">
          <button
            type="button"
            onClick={() => onChangeMode('lookup')}
            className={`flex-1 py-1.5 text-xs font-medium transition-colors ${
              mode === 'lookup'
                ? 'bg-[var(--cta-bg)] text-[var(--cta-fg)]'
                : 'bg-[var(--panel-2)] text-[var(--text-muted)] hover:text-[var(--text)]'
            }`}
          >
            Link to entries
          </button>
          <button
            type="button"
            onClick={() => onChangeMode('anchor')}
            className={`flex-1 py-1.5 text-xs font-medium transition-colors ${
              mode === 'anchor'
                ? 'bg-[var(--cta-bg)] text-[var(--cta-fg)]'
                : 'bg-[var(--panel-2)] text-[var(--text-muted)] hover:text-[var(--text)]'
            }`}
          >
            Expand from track
          </button>
        </div>
        <p className="mt-1 text-[11px] text-[var(--text-muted)]">
          {mode === 'lookup'
            ? 'Reference a specific entry from another track (e.g. link a Project to a Contact).'
            : 'Anchor a sub-track to this entry (e.g. a Project expands into its own Tasks track).'}
        </p>
      </div>

      {/* Target track */}
      <div>
        <label className="text-xs font-medium text-[var(--text-muted)]">
          {mode === 'lookup' ? 'Source track' : 'Anchored track'}
        </label>
        <select
          className="app-input text-sm w-full mt-1"
          value={targetTrackId}
          onChange={e => {
            onChangeTargetTrack(e.target.value);
            onChangeTargetEntryType(''); // reset entry type when track changes
          }}
        >
          <option value="">Select a track…</option>
          {tracks.map(t => (
            <option key={t.id} value={t.id}>{t.title}</option>
          ))}
        </select>
      </div>

      {/* Entry type filter — lookup only */}
      {mode === 'lookup' && targetTrackId && (
        <div>
          <label className="text-xs font-medium text-[var(--text-muted)]">
            Entry type (optional filter)
          </label>
          <select
            className="app-input text-sm w-full mt-1"
            value={targetEntryTypeId}
            onChange={e => onChangeTargetEntryType(e.target.value)}
          >
            <option value="">Any entry type</option>
            {entryTypes.map(et => (
              <option key={et.id} value={et.id}>{et.name}</option>
            ))}
          </select>
          <p className="mt-1 text-[11px] text-[var(--text-muted)]">
            Restrict the picker to entries of this type.
          </p>
        </div>
      )}

      {/* Cardinality — lookup only (anchors are always 1:1) */}
      {mode === 'lookup' && (
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={many}
            onChange={e => onChangeMany(e.target.checked)}
          />
          Allow multiple (one-to-many)
        </label>
      )}
    </div>
  );
}
