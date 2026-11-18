import { useId } from 'react';
import { Select, Text } from '../../ui';
import { TrackDot } from '../ui';
import { MANIFEST_ICON_IDS, knownManifestIcon } from '../../lib/manifestLucideIcon';

export function TrackIconPicker({ value, onChange, disabled = false }: {
  value: string;
  onChange(value: string): void;
  disabled?: boolean;
}) {
  const id = useId();
  const currentIsListed = !value || MANIFEST_ICON_IDS.includes(value);
  return (
    <div className="space-y-2">
      <label htmlFor={id}><Text variant="label">Track icon</Text></label>
      <div className="flex items-center gap-3">
        <span aria-hidden="true"><TrackDot icon={value} size="lg" /></span>
        <Select id={id} value={value} disabled={disabled}
          aria-describedby={`${id}-hint`} onChange={event => onChange(event.target.value)}>
          <option value="">Dot (default)</option>
          {!currentIsListed && <option value={value}>
            {knownManifestIcon(value) ? 'Current icon' : 'Current value (shown as a dot)'}
          </option>}
          {MANIFEST_ICON_IDS.map(key => (
            <option key={key} value={key}>{key.replace(/-/g, ' ')}</option>
          ))}
        </Select>
      </div>
      <Text as="p" id={`${id}-hint`} variant="meta" tone="muted">
        Choose a built-in symbol or use the default dot.
      </Text>
    </div>
  );
}
