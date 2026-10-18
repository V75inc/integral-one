interface DateConfigProps {
  withTime: boolean;
  onChange: (withTime: boolean) => void;
}

export function DateConfig({ withTime, onChange }: DateConfigProps) {
  return (
    <div className="space-y-1">
      <label className="text-xs font-medium text-[var(--text-muted)]">Date format</label>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={withTime}
          onChange={e => onChange(e.target.checked)}
        />
        Include time of day
      </label>
    </div>
  );
}
