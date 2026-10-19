import { useEffect, useState } from 'react';
import { Modal } from '../ui';
import { Button } from '../ui/Button';
import { Text } from '../../ui/Text';
import type { Entry } from '../../types';
import {
  initialDropFieldValues,
  type KanbanDropField,
  type ResolvedKanbanDrop,
} from './kanbanDropActions';

interface KanbanDropDialogProps {
  entry: Entry | null;
  action: ResolvedKanbanDrop | null;
  busy: boolean;
  error: string;
  onClose: () => void;
  onSubmit: (input: Record<string, string>) => void;
}

export function KanbanDropDialog({
  entry,
  action,
  busy,
  error,
  onClose,
  onSubmit,
}: KanbanDropDialogProps) {
  const [values, setValues] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!entry || !action) {
      setValues({});
      return;
    }
    setValues(initialDropFieldValues(action.fields, entry));
  }, [entry, action]);

  if (!entry || !action || action.mode !== 'form') return null;

  const setField = (key: string, value: string) => {
    setValues(prev => ({ ...prev, [key]: value }));
  };

  return (
    <Modal
      open
      onClose={busy ? () => undefined : onClose}
      title={action.title}
      variant="compact"
      width="max-w-dialog-confirm"
    >
      <form
        className="flex flex-col gap-3"
        onSubmit={event => {
          event.preventDefault();
          if (!busy) onSubmit(values);
        }}
      >
        {action.message ? (
          <Text variant="body-sm" tone="muted">
            {action.message}
          </Text>
        ) : null}
        <Text variant="body" weight="medium">
          {entry.title || 'This card'}
        </Text>
        {action.fields.map(field => (
          <Field
            key={field.key}
            field={field}
            value={values[field.key] ?? ''}
            disabled={busy}
            onChange={value => setField(field.key, value)}
          />
        ))}
        {error ? (
          <Text variant="body-sm" tone="danger">
            {error}
          </Text>
        ) : null}
        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="outline" size="sm" disabled={busy} onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" size="sm" loading={busy}>
            {action.confirmLabel}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function Field({
  field,
  value,
  disabled,
  onChange,
}: {
  field: KanbanDropField;
  value: string;
  disabled: boolean;
  onChange: (value: string) => void;
}) {
  const id = `kanban-drop-${field.key}`;
  return (
    <label htmlFor={id} className="flex flex-col gap-1">
      <Text as="span" variant="label">
        {field.label}
      </Text>
      {field.type === 'select' ? (
        <select
          id={id}
          className="app-input text-sm w-full"
          value={value}
          disabled={disabled}
          onChange={event => onChange(event.target.value)}
        >
          {field.options.map(option => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      ) : (
        <input
          id={id}
          className="app-input text-sm w-full"
          type={field.type === 'number' ? 'number' : 'text'}
          min={field.type === 'number' ? '0.01' : undefined}
          step={field.type === 'number' ? 'any' : undefined}
          value={value}
          disabled={disabled}
          onChange={event => onChange(event.target.value)}
        />
      )}
    </label>
  );
}
