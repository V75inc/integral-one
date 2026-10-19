import React from 'react';

interface IncludeSeedDataToggleProps {
  checked: boolean;
  onChange(checked: boolean): void;
  seedEntryCount?: number;
  disabled?: boolean;
  testId?: string;
}

/** Shared install-time control for manifest example/seed entries. */
export function IncludeSeedDataToggle({
  checked,
  onChange,
  seedEntryCount = 0,
  disabled = false,
  testId = 'include-seed-data-toggle',
}: IncludeSeedDataToggleProps) {
  const hasSeeds = seedEntryCount > 0;
  const label = hasSeeds
    ? `Include example data (${seedEntryCount} ${seedEntryCount === 1 ? 'entry' : 'entries'})`
    : 'Include example data';

  return (
    <label
      className="flex items-start gap-2.5 cursor-pointer select-none"
      data-testid={testId}
    >
      <input
        type="checkbox"
        className="mt-0.5 shrink-0"
        checked={checked}
        disabled={disabled}
        onChange={e => onChange(e.target.checked)}
        data-testid={`${testId}-checkbox`}
      />
      <span className="text-sm text-[var(--text)]">
        <span className="font-medium">{label}</span>
        <span className="block text-xs text-[var(--text-subtle)] mt-0.5">
          {hasSeeds
            ? 'Adds starter records to tracks so the app has visible state after install.'
            : 'This bundle does not declare example entries; the option has no effect.'}
        </span>
      </span>
    </label>
  );
}
