import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AppSelect } from '../../ui/AppSelect';
import { Surface, Text } from '../../../ui';
import {
  FieldLabelContent,
  fieldAriaLabel,
  isFieldRequired,
} from '../fieldLabel';
import { buildFieldPlaceholder } from '../../../utils/fieldPlaceholders';
import { documentsApi, type DocumentTemplate } from '../../../features/documents/api';
import type { OperationalModelFieldSpec } from '../../../types';
import type { FieldTypeRendererProps, FieldTypeRegistration } from './types';

const noop = () => undefined;

function fieldConfig(field: OperationalModelFieldSpec): Record<string, unknown> {
  return (field.config as Record<string, unknown> | undefined) ?? {};
}

function FloatingLabel({
  show,
  name,
  required,
}: {
  show: boolean;
  name: string;
  required: boolean;
}) {
  if (!show) return null;
  return (
    <Surface as="span" tone="panel" border="none" radius="input" padding="xs" className="pointer-events-none absolute -top-2.5 left-3 z-[1]">
      <Text as="span" variant="label" tone="muted">
      <FieldLabelContent name={name} required={required} />
      </Text>
    </Surface>
  );
}

function DocumentTemplateFieldEditor({
  field,
  value,
  onChange,
}: FieldTypeRendererProps) {
  const cfg = fieldConfig(field);
  const module = String(cfg.module || 'hr_app').trim();
  const documentType = String(cfg.document_type || '').trim();
  const status = String(cfg.status || 'active').trim();

  const templatesQ = useQuery({
    queryKey: ['document-template-field', module, documentType, status],
    queryFn: async () => {
      const res = await documentsApi.listTemplates({
        module,
        document_type: documentType || undefined,
        status: status || undefined,
      });
      return (res.templates || []).filter(
        (t: DocumentTemplate) => t.status !== 'archived',
      );
    },
  });

  const templates = templatesQ.data || [];
  const selectedId = String(value || '').trim();
  const selected = templates.find(t => t.id === selectedId);

  const options = useMemo(
    () =>
      [...templates]
        .sort((a, b) => (a.name || '').localeCompare(b.name || ''))
        .map(t => ({
          value: t.id,
          label: t.name,
          description: [t.document_type, t.status !== 'active' ? t.status : '']
            .filter(Boolean)
            .join(' · '),
        })),
    [templates],
  );

  const placeholder =
    buildFieldPlaceholder(field) || 'Select document template…';
  const required = isFieldRequired(field);
  const readOnly = onChange === noop;
  const hasValue = Boolean(selectedId);
  const [hovered, setHovered] = useState(false);
  const [focusWithin, setFocusWithin] = useState(false);
  const showFloat =
    focusWithin || hovered || hasValue || isFieldRequired(field);
  const active = focusWithin || hasValue || readOnly;

  if (readOnly) {
    return (
      <Text as="div" variant="body" className="px-3 py-2">
        {selected?.name || selectedId || '—'}
      </Text>
    );
  }

  return (
    <div
      className="relative min-w-0 pl-3"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocusCapture={() => setFocusWithin(true)}
      onBlurCapture={e => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
          setFocusWithin(false);
        }
      }}
    >
      <Surface
        tone={active ? 'panel' : 'transparent'}
        border={active ? 'default' : 'transparent'}
        hoverTone={active ? undefined : 'panel-2'}
        radius="input"
        className="relative transition-[border-color,background-color] duration-fast"
        aria-required={required || undefined}
      >
        <FloatingLabel show={showFloat} name={field.name} required={required} />
        <div className="py-0.5">
          <AppSelect
            id={`field-${field.key}`}
            variant="pill"
            className="w-full max-w-full border-0 bg-transparent px-3 py-1 font-normal shadow-none focus:ring-0"
            value={selectedId}
            onValueChange={val => onChange(val || null)}
            disabled={templatesQ.isLoading}
            placeholder={placeholder}
            options={[{ value: '', label: placeholder }, ...options]}
            aria-label={fieldAriaLabel(field)}
          />
        </div>
      </Surface>
      {templatesQ.isError ? (
        <Text variant="body-sm" tone="muted" className="mt-1 pl-1">
          Could not load document templates.
        </Text>
      ) : null}
      {!templatesQ.isLoading && options.length === 0 ? (
        <Text variant="body-sm" tone="muted" className="mt-1 pl-1">
          No templates yet. Create one under Settings → Document templates.
        </Text>
      ) : null}
    </div>
  );
}

function DocumentTemplateFieldReader(props: FieldTypeRendererProps) {
  return <DocumentTemplateFieldEditor {...props} onChange={noop} />;
}

export const documentTemplateFieldRegistration: FieldTypeRegistration = {
  type: 'document_template',
  editor: DocumentTemplateFieldEditor,
  renderer: DocumentTemplateFieldReader,
  meta: {
    label: 'Document template',
    description: 'Pick a workspace document template by id.',
  },
  source: 'builtin',
};

export { DocumentTemplateFieldEditor, DocumentTemplateFieldReader };
