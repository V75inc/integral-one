import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FormDialog } from '../../templates';
import { Field } from '../../patterns/Field';
import { Button } from '../../components/ui/Button';
import { Input, Select, Text } from '../../ui';
import { documentsApi, type DocumentTemplate } from './api';
import { useDocumentTemplatesAppInstalled } from './useDocumentTemplatesApp';

interface Props {
  open: boolean;
  onClose: () => void;
  module: string;
  contextType: string;
  contextEntryId: string;
  documentType?: string;
}

export function GenerateDocumentModal({
  open,
  onClose,
  module,
  contextType,
  contextEntryId,
  documentType,
}: Props) {
  const qc = useQueryClient();
  const [templateId, setTemplateId] = useState('');
  const [outputFormat, setOutputFormat] = useState<'pdf' | 'html' | 'docx'>('pdf');
  const [inputs, setInputs] = useState<Record<string, string>>({});

  const templatesQ = useQuery({
    queryKey: ['document-templates', module, contextType, documentType],
    queryFn: () =>
      documentsApi.listTemplates({
        module,
        context: contextType,
        document_type: documentType,
        status: 'active',
      }),
    enabled: open,
  });

  const templates = templatesQ.data?.templates || [];
  const selected: DocumentTemplate | undefined = useMemo(
    () => templates.find(t => t.id === templateId) || templates.find(t => t.is_default) || templates[0],
    [templates, templateId],
  );

  const detailQ = useQuery({
    queryKey: ['document-template', selected?.id],
    queryFn: () => documentsApi.getTemplate(selected!.id),
    enabled: open && Boolean(selected?.id),
  });

  const requiredInputs =
    detailQ.data?.current_version?.required_inputs || [];

  const generateM = useMutation({
    mutationFn: () =>
      documentsApi.generate({
        template_id: selected?.id,
        module,
        document_type: selected?.document_type || documentType,
        context_type: contextType,
        context_entry_id: contextEntryId,
        output_format: outputFormat,
        input_values: inputs,
      }),
    onSuccess: async doc => {
      qc.invalidateQueries({ queryKey: ['generated-documents', contextEntryId] });
      try {
        const blob = await documentsApi.download(doc.id);
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${selected?.name || 'document'}.${outputFormat}`;
        a.click();
        URL.revokeObjectURL(url);
      } catch {
        // download optional — generation still succeeded
      }
      onClose();
    },
  });

  return (
    <FormDialog
      open={open}
      onClose={onClose}
      title="Generate document"
        submitLabel="Generate"
        submitLoading={generateM.isPending}
        submitDisabled={!selected}
        onSubmit={e => {
          e.preventDefault();
          generateM.mutate();
        }}
      >
      <div className="space-y-3">
        <Field label="Template" htmlFor="generate-doc-template">
          <Select
            id="generate-doc-template"
            value={selected?.id || ''}
            onChange={e => setTemplateId(e.target.value)}
          >
            {templates.map(t => (
              <option key={t.id} value={t.id}>
                {t.name}
                {t.is_default ? ' (default)' : ''}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Format" htmlFor="generate-doc-format">
          <Select
            id="generate-doc-format"
            value={outputFormat}
            onChange={e =>
              setOutputFormat(e.target.value as 'pdf' | 'html' | 'docx')
            }
          >
            <option value="pdf">PDF</option>
            <option value="html">HTML</option>
            <option value="docx">DOCX</option>
          </Select>
        </Field>
        {requiredInputs.map(inp => {
          const key = String(inp.key || '');
          if (!key) return null;
          return (
            <Field key={key} label={String(inp.label || key)} htmlFor={`generate-doc-input-${key}`}>
              <Input
                id={`generate-doc-input-${key}`}
                value={inputs[key] || ''}
                onChange={e =>
                  setInputs(prev => ({ ...prev, [key]: e.target.value }))
                }
                required={Boolean(inp.required ?? true)}
              />
            </Field>
          );
        })}
        {templates.length === 0 && !templatesQ.isLoading ? (
          <Text as="p" variant="body" tone="muted">
            No active templates for this context. Install the Document Templates
            app and create templates from its app page.
          </Text>
        ) : null}
        {generateM.isError ? (
          <p className="text-sm text-red-600">
            {(generateM.error as Error)?.message || 'Generation failed'}
          </p>
        ) : null}
      </div>
    </FormDialog>
  );
}

export function GenerateDocumentButton(props: Omit<Props, 'open' | 'onClose'>) {
  const [open, setOpen] = useState(false);
  const { isInstalled, isLoading } = useDocumentTemplatesAppInstalled();

  if (isLoading) return null;
  if (!isInstalled) {
    return (
      <Link
        to="/apps"
        className="inline-flex items-center"
        title="Install the Document Templates app from Manage Apps"
      >
        <Text variant="body-sm" tone="muted">Install Document Templates</Text>
      </Link>
    );
  }

  return (
    <>
      <Button size="sm" variant="secondary" onClick={() => setOpen(true)}>
        Generate document
      </Button>
      <GenerateDocumentModal
        {...props}
        open={open}
        onClose={() => setOpen(false)}
      />
    </>
  );
}
