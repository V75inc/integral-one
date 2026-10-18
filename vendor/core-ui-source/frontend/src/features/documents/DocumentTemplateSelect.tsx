import { AppSelect } from '../../components/ui/AppSelect';
import type { DocumentTemplate } from './api';

interface DocumentTemplateSelectProps {
  value: string;
  onValueChange: (templateId: string) => void;
  templates: DocumentTemplate[];
  disabled?: boolean;
  id?: string;
  placeholder?: string;
  'aria-label'?: string;
}

export function DocumentTemplateSelect({
  value,
  onValueChange,
  templates,
  disabled,
  id,
  placeholder = 'Select template…',
  'aria-label': ariaLabel = 'Document template',
}: DocumentTemplateSelectProps) {
  const sorted = [...templates].sort((a, b) =>
    (a.name || '').localeCompare(b.name || ''),
  );

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
          label: sorted.length ? placeholder : 'No templates available',
          disabled: !sorted.length,
        },
        ...sorted.map(t => ({
          value: t.id,
          label: t.name,
          description: [t.document_type, t.status !== 'active' ? t.status : '']
            .filter(Boolean)
            .join(' · '),
        })),
      ]}
    />
  );
}
