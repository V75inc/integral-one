import type { ReactNode } from 'react';

import { Input } from '../../../ui';
import {
  Field,
  Section,
  type FieldProps,
  type SectionProps,
} from '../../../patterns';

/**
 * @deprecated Use `<Field>` from `frontend/src/patterns` directly.
 * `SettingsField` is now a thin alias kept for back-compat with the
 * 30+ existing settings callsites; new code should import `Field`.
 */
export function SettingsField(props: FieldProps) {
  return <Field {...props} />;
}

/**
 * @deprecated Use `<Section>` from `frontend/src/patterns` directly.
 * `SettingsSection` is now a thin alias kept for back-compat with
 * existing settings callsites.
 */
export function SettingsSection(props: SectionProps) {
  return <Section {...props} />;
}

/**
 * @deprecated Use `<Input>` from `frontend/src/ui` directly.
 *
 * Kept as a thin wrapper around `<Input>` for back-compat with the
 * Policy + Connector modals that pass `(v: string) => void` onChange
 * signature. New code should use `<Input>` with a standard event
 * handler instead.
 */
export function TextInput({
  value,
  onChange,
  placeholder,
  type = 'text',
  monospace = false,
  id,
  ...accessibility
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: 'text' | 'password' | 'url';
  id?: string;
  'aria-describedby'?: string;
  'aria-invalid'?: boolean;
  'aria-required'?: boolean;
  monospace?: boolean;
}) {
  return (
    <Input
      id={id}
      {...accessibility}
      type={type}
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      monospace={monospace}
    />
  );
}

export function ToggleRow({
  checked,
  onChange,
  label,
  hint,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: ReactNode;
  hint?: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={`
        flex w-full items-center justify-between gap-4
        rounded-[var(--radius-card)] border border-[var(--border-subtle)]
        bg-[var(--panel-2)] px-4 py-3 text-left
        transition hover:border-[var(--panel-border)]
        focus:outline-none focus:ring-2 focus:ring-[var(--focus-ring-color)]
      `}
      aria-pressed={checked}
    >
      <div className="flex flex-col gap-0.5 min-w-0 flex-1">
        <span className="text-sm font-medium text-[var(--text)]">{label}</span>
        {hint && (
          <span className="text-xs text-[var(--text-subtle)]">{hint}</span>
        )}
      </div>
      <span
        className={`
          relative inline-flex h-5 w-9 shrink-0 items-center rounded-full
          transition-colors duration-fast
          ${checked ? 'bg-[var(--brand-accent)]' : 'bg-[var(--badge-muted-bg)]'}
        `}
        aria-hidden
      >
        <span
          className={`
            inline-block h-4 w-4 rounded-full bg-white shadow-[var(--shadow-sm)]
            transition-transform duration-fast
            ${checked ? 'translate-x-[18px]' : 'translate-x-[2px]'}
          `}
        />
      </span>
    </button>
  );
}

export function StatusPill({
  state,
  children,
}: {
  state: 'ok' | 'warn' | 'idle';
  children: ReactNode;
}) {
  const cls =
    state === 'ok'
      ? 'text-[var(--success-fg)] bg-[var(--success-bg)]'
      : state === 'warn'
        ? 'text-[var(--warn-fg)] bg-[var(--warn-bg)]'
        : 'text-[var(--badge-muted-fg)] bg-[var(--badge-muted-bg)]';
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-[var(--radius-pill)] px-2 py-0.5 text-[10px] uppercase tracking-wide ${cls}`}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden />
      {children}
    </span>
  );
}
