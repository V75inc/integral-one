import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Button } from '../../components/ui';
import { FormDialog } from '../../templates';
import { Surface, Text } from '../../ui';
import { useToast } from '../../context/ToastContext';
import { agentiveErrorMessage } from '../../api/helpers';
import { documentsApi, type DocumentLayout } from './api';
import {
  DEFAULT_PAGE_SIZE,
  MARGIN_PRESETS,
  normalizeMargins,
  normalizePageSize,
  type MarginsInches,
} from './documentTheme';
import {
  PageLayoutFormFields,
  type PageLayoutFormValues,
} from './PageLayoutFormFields';
import { marginPresetKeyFor } from './pageLayoutUi';

function layoutToForm(layout?: DocumentLayout | null): PageLayoutFormValues {
  if (!layout) {
    return {
      layoutSource: 'custom',
      layoutId: '',
      layoutName: '',
      pageSize: DEFAULT_PAGE_SIZE,
      marginPreset: 'normal',
      pageNumbers: true,
      headerHtml: '',
      footerHtml: '',
    };
  }
  const margins = normalizeMargins(layout.margins as Partial<MarginsInches>);
  return {
    layoutSource: 'saved',
    layoutId: layout.id,
    layoutName: layout.name,
    pageSize: normalizePageSize(layout.page_size),
    marginPreset: marginPresetKeyFor(margins),
    pageNumbers: layout.page_numbers !== false,
    headerHtml: layout.header_html || '',
    footerHtml: layout.footer_html || '',
  };
}

interface Props {
  workspaceId: string;
  autoOpenCreate?: boolean;
  onAutoOpenHandled?: () => void;
}

export function DocumentLayoutsPanel({
  workspaceId,
  autoOpenCreate,
  onAutoOpenHandled,
}: Props) {
  const qc = useQueryClient();
  const { showToast } = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<DocumentLayout | null>(null);
  const [form, setForm] = useState<PageLayoutFormValues>(() => layoutToForm(null));

  const layoutsQ = useQuery({
    queryKey: ['document-layouts', workspaceId],
    queryFn: () => documentsApi.listLayouts(),
    enabled: Boolean(workspaceId),
  });

  const layouts = layoutsQ.data?.layouts || [];
  const margins = MARGIN_PRESETS[form.marginPreset] || MARGIN_PRESETS.normal;

  const openCreate = () => {
    setEditing(null);
    setForm(layoutToForm(null));
    setDialogOpen(true);
  };

  const openEdit = (layout: DocumentLayout) => {
    setEditing(layout);
    setForm(layoutToForm(layout));
    setDialogOpen(true);
  };

  useEffect(() => {
    if (!autoOpenCreate) return;
    openCreate();
    onAutoOpenHandled?.();
  }, [autoOpenCreate]); // eslint-disable-line react-hooks/exhaustive-deps

  const saveM = useMutation({
    mutationFn: async () => {
      const body = {
        name: (form.layoutName || editing?.name || 'Letterhead').trim(),
        page_size: form.pageSize,
        margins,
        page_numbers: form.pageNumbers,
        header_html: form.headerHtml,
        footer_html: form.footerHtml,
      };
      if (editing) {
        return documentsApi.updateLayout(editing.id, body);
      }
      return documentsApi.createLayout(body);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['document-layouts', workspaceId] });
      setDialogOpen(false);
      setEditing(null);
      showToast(editing ? 'Layout updated' : 'Layout created', 'success');
    },
    onError: err => {
      showToast(agentiveErrorMessage(err, 'Could not save layout'), 'error');
    },
  });

  return (
    <>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between mb-4">
        <div className="max-w-2xl">
          <h2 className="text-lg font-semibold tracking-tight">Page layouts</h2>
          <Text as="p" variant="body" tone="muted" className="mt-1 leading-relaxed">
            Reusable letterheads with paper size, margins, and repeating top or
            bottom text. Pick one when editing a template under Page appearance.
          </Text>
        </div>
        <Button variant="secondary" className="shrink-0" onClick={openCreate}>
          New layout
        </Button>
      </div>

      <div className="overflow-x-auto rounded-lg border border-[var(--panel-border)]">
        <table className="w-full text-sm">
          <Surface as="thead" tone="panel" border="none" radius="none" className="text-left">
            <tr>
              <th className="px-3 py-2">Name</th>
              <th className="px-3 py-2 hidden sm:table-cell">Paper</th>
              <th className="px-3 py-2 hidden md:table-cell">Page numbers</th>
              <th className="px-3 py-2 w-24">Actions</th>
            </tr>
          </Surface>
          <tbody>
            {layouts.map(layout => (
              <tr key={layout.id} className="border-t border-[var(--panel-border)]">
                <td className="px-3 py-2 font-medium">{layout.name}</td>
                <td className="px-3 py-2 hidden sm:table-cell capitalize">
                  <Text variant="body" tone="muted">{layout.page_size || 'letter'}</Text>
                </td>
                <td className="px-3 py-2 hidden md:table-cell">
                  <Text variant="body" tone="muted">
                    {layout.page_numbers !== false ? 'Yes' : 'No'}
                  </Text>
                </td>
                <td className="px-3 py-2">
                  <button
                    type="button"
                    className="text-xs text-[var(--link)] hover:text-[var(--link-hover)] hover:underline"
                    onClick={() => openEdit(layout)}
                  >
                    Edit
                  </button>
                </td>
              </tr>
            ))}
            {!layoutsQ.isLoading && layouts.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-3 py-10 text-center">
                  <Text variant="body" tone="muted">
                    No saved layouts yet. Create one to reuse across templates.
                  </Text>
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <FormDialog
        open={dialogOpen}
        onClose={() => {
          setDialogOpen(false);
          setEditing(null);
        }}
        title={editing ? 'Edit page layout' : 'New page layout'}
        submitLabel={editing ? 'Save changes' : 'Create layout'}
        submitDisabled={!form.layoutName.trim() && !editing}
        submitLoading={saveM.isPending}
        onSubmit={e => {
          e.preventDefault();
          saveM.mutate();
        }}
        size="wide"
      >
        <div className="space-y-4">
          <Text variant="body-sm" tone="muted">
            {editing
              ? 'Update this letterhead. Templates already using it will pick up changes on their next save.'
              : 'Build a letterhead your team can reuse. No technical setup required.'}
          </Text>
          <PageLayoutFormFields
            values={form}
            margins={margins}
            savedLayouts={[]}
            showLayoutPicker={false}
            showLayoutName
            onChange={patch => setForm(prev => ({ ...prev, ...patch }))}
            onSelectSavedLayout={() => {}}
            onStartCustom={() => {}}
          />
        </div>
      </FormDialog>
    </>
  );
}
