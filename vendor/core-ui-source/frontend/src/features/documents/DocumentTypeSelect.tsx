import { useMemo } from 'react';
import { AppSelect } from '../../components/ui/AppSelect';
import type { DocumentTypeOption } from './useDocumentTypes';

interface DocumentTypeSelectProps {
  value: string;
  onValueChange: (code: string) => void;
  options: DocumentTypeOption[];
  disabled?: boolean;
  id?: string;
  placeholder?: string;
  'aria-label'?: string;
}

function humanizeCode(code: string): string {
  return code
    .split('_')
    .filter(Boolean)
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

export function DocumentTypeSelect({
  value,
  onValueChange,
  options,
  disabled,
  id,
  placeholder = 'Select document type…',
  'aria-label': ariaLabel = 'Document type',
}: DocumentTypeSelectProps) {
  const mergedOptions = useMemo(() => {
    if (!value || options.some(dt => dt.code === value)) {
      return options;
    }
    return [
      {
        id: value,
        code: value,
        name: humanizeCode(value),
        title: humanizeCode(value),
        description: value,
      },
      ...options,
    ];
  }, [options, value]);

  return (
    <AppSelect
      id={id}
      aria-label={ariaLabel}
      value={value}
      onValueChange={onValueChange}
      disabled={disabled}
      placeholder={placeholder}
      className="app-input"
      options={[
        {
          value: '',
          label: mergedOptions.length ? placeholder : 'Add document types below',
          disabled: !mergedOptions.length,
        },
        ...mergedOptions.map(dt => ({
          value: dt.code,
          label: dt.title,
          description: dt.code,
        })),
      ]}
    />
  );
}
