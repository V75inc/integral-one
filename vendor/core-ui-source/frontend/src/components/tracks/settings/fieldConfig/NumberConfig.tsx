interface NumberConfigProps {
  min?: number;
  max?: number;
  step?: number;
  onChange: (next: { min?: number; max?: number; step?: number }) => void;
  error?: string;
}

export function NumberConfig({ min, max, step, onChange, error }: NumberConfigProps) {
  const toNum = (v: string): number | undefined => (v === '' ? undefined : Number(v));
  return (
    <div className="space-y-2">
      <label className="text-xs font-medium text-[var(--text-muted)]">Number constraints</label>
      <div className="grid grid-cols-3 gap-2">
        <input
          type="number"
          placeholder="min"
          className="app-input text-sm"
          value={min ?? ''}
          onChange={e => onChange({ min: toNum(e.target.value), max, step })}
        />
        <input
          type="number"
          placeholder="max"
          className="app-input text-sm"
          value={max ?? ''}
          onChange={e => onChange({ min, max: toNum(e.target.value), step })}
        />
        <input
          type="number"
          placeholder="step"
          className="app-input text-sm"
          value={step ?? ''}
          onChange={e => onChange({ min, max, step: toNum(e.target.value) })}
        />
      </div>
      {error ? <p className="text-xs text-[var(--danger-fg)]">{error}</p> : null}
    </div>
  );
}
