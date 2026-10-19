import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Button } from '../../components/ui';
import { FormDialog } from '../../templates';
import { Field } from '../../patterns/Field';
import { Input, Surface, Text } from '../../ui';
import { documentsApi } from './api';
import { useDocumentTypes } from './useDocumentTypes';
import { useToast } from '../../context/ToastContext';
import { agentiveErrorMessage } from '../../api/helpers';

export function DocumentTypesPanel() {
  const qc = useQueryClient();
  const { showToast } = useToast();
  const typesQ = useDocumentTypes();
  const types = typesQ.data || [];
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState({ code: '', name: '', description: '' });

  const createM = useMutation({
    mutationFn: () =>
      documentsApi.createDocumentType({
        code: form.code.trim(),
        name: form.name.trim(),
        description: form.description.trim(),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['document-types'] });
      setCreateOpen(false);
      setForm({ code: '', name: '', description: '' });
      showToast('Document type created', 'success');
    },
    onError: err => {
      showToast(agentiveErrorMessage(err, 'Could not create document type'), 'error');
    },
  });

  const deleteM = useMutation({
    mutationFn: (id: string) => documentsApi.deleteDocumentType(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['document-types'] });
      showToast('Document type deleted', 'success');
    },
    onError: err => {
      showToast(agentiveErrorMessage(err, 'Could not delete document type'), 'error');
    },
  });

  return (
    <>
      <div className="flex items-start justify-between gap-4 mb-4">
        <div>
          <h2 className="text-lg font-semibold">Document types</h2>
          <Text as="p" variant="body" tone="muted" className="mt-1">
            Classify templates (e.g. employment contract, offer letter). Types are
            workspace-wide and managed here alongside templates.
          </Text>
        </div>
        <Button variant="secondary" onClick={() => setCreateOpen(true)}>
          Add type
        </Button>
      </div>
      <div className="overflow-x-auto rounded-lg border border-[var(--panel-border)]">
        <table className="w-full text-sm">
          <Surface as="thead" tone="panel" border="none" radius="none" className="text-left">
            <tr>
              <th className="px-3 py-2">Name</th>
              <th className="px-3 py-2">Code</th>
              <th className="px-3 py-2">Description</th>
              <th className="px-3 py-2 w-24">Actions</th>
            </tr>
          </Surface>
          <tbody>
            {types.map(dt => (
              <tr key={dt.id} className="border-t border-[var(--panel-border)]">
                <td className="px-3 py-2">{dt.title}</td>
                <td className="px-3 py-2 font-mono text-xs">{dt.code}</td>
                <td className="px-3 py-2">
                  <Text variant="body" tone="muted">{dt.description || '—'}</Text>
                </td>
                <td className="px-3 py-2">
                  <button
                    type="button"
                    className="text-xs text-[var(--danger-fg)] hover:underline disabled:opacity-50"
                    disabled={deleteM.isPending}
                    onClick={() => {
                      if (
                        !window.confirm(
                          `Delete “${dt.title}”? Templates using this code must be updated first.`,
                        )
                      ) {
                        return;
                      }
                      deleteM.mutate(dt.id);
                    }}
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
            {!typesQ.isLoading && types.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-3 py-8 text-center">
                  <Text variant="body" tone="muted">
                    No document types yet. Add one or refresh to load defaults.
                  </Text>
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <FormDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Add document type"
        submitLabel="Create"
        submitDisabled={!form.code.trim()}
        submitLoading={createM.isPending}
        onSubmit={e => {
          e.preventDefault();
          createM.mutate();
        }}
      >
        <div className="space-y-3">
          <Field label="Code" htmlFor="doc-type-code">
            <Input
              id="doc-type-code"
              value={form.code}
              placeholder="employment_contract"
              onChange={e => setForm(f => ({ ...f, code: e.target.value }))}
            />
          </Field>
          <Text variant="body-sm" tone="muted">
            Lowercase slug used when linking templates. Cannot be changed after
            creation.
          </Text>
          <Field label="Display name" htmlFor="doc-type-name">
            <Input
              id="doc-type-name"
              value={form.name}
              placeholder="Employment contract"
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
            />
          </Field>
          <Field label="Description" htmlFor="doc-type-desc">
            <Input
              id="doc-type-desc"
              value={form.description}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
            />
          </Field>
        </div>
      </FormDialog>
    </>
  );
}
