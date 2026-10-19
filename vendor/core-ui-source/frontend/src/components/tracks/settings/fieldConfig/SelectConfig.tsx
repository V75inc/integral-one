import { Plus, X } from 'lucide-react';
import { LINE_ICON_STROKE } from '../../../ui';

interface SelectConfigProps {
  options: string[];
  onChange: (next: string[]) => void;
  error?: string;
}

export function SelectConfig({ options, onChange, error }: SelectConfigProps) {
  const setAt = (i: number, value: string) => {
    onChange(options.map((o, idx) => (idx === i ? value : o)));
  };
  const removeAt = (i: number) => {
    onChange(options.filter((_, idx) => idx !== i));
  };
  const add = () => onChange([...options, '']);
  return (
    <div className="space-y-2">
      <label className="text-xs font-medium text-[var(--text-muted)]">Options</label>
      {options.length === 0 && !error ? (
        <p className="text-xs text-[var(--text-muted)]">Add at least one option.</p>
      ) : null}
      {options.map((opt, i) => (
        <div key={i} className="flex items-center gap-2">
          <input
            className="app-input text-sm flex-1"
            value={opt}
            placeholder={`Option ${i + 1}`}
            onChange={e => setAt(i, e.target.value)}
          />
          <button
            type="button"
            className="text-[var(--text-muted)] hover:text-[var(--danger-fg)] p-1"
            onClick={() => removeAt(i)}
            aria-label={`Remove option ${i + 1}`}
          >
            <X size={14} strokeWidth={LINE_ICON_STROKE} />
          </button>
        </div>
      ))}
      <button
        type="button"
        className="inline-flex items-center gap-1 text-xs text-[var(--link)] hover:underline"
        onClick={add}
      >
        <Plus size={14} strokeWidth={LINE_ICON_STROKE} />
        Add option
      </button>
      {error ? <p className="text-xs text-[var(--danger-fg)]">{error}</p> : null}
    </div>
  );
}
