import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  FileStack,
  FileText,
  History,
  LayoutTemplate,
  Pencil,
  Trash2,
} from 'lucide-react';
import {
  Button,
  LINE_ICON_STROKE,
  PageHeading,
  PageMeta,
  PageSection,
  PageShell,
  HoverTooltip,
  ViewTabs,
} from '../../components/ui';
import { FormDialog } from '../../templates';
import { Field } from '../../patterns/Field';
import { IconButton, Input, Surface, Text } from '../../ui';
import { AppSelect } from '../../components/ui/AppSelect';
import { documentsApi, type DocumentTemplate } from './api';
import { appsApi } from '../../api/apps';
import { DocumentTypeSelect } from './DocumentTypeSelect';
import { DocumentTypesPanel } from './DocumentTypesPanel';
import { DocumentLayoutsPanel } from './DocumentLayoutsPanel';
import { useDocumentTypes } from './useDocumentTypes';
import { useScope } from '../../context/ScopeContext';
import { useToast } from '../../context/ToastContext';
import { useConfirm } from '../../context/ConfirmContext';
import { agentiveErrorMessage } from '../../api/helpers';
import { useDocumentTemplatesPageContext } from './useDocumentTemplatesPageContext';
import { resolveInstalledPackageSlug } from './documentTemplatesRouting';

type DocTemplatesSection = 'templates' | 'types' | 'layouts';

function normalizeSection(raw: string | null): DocTemplatesSection {
  if (raw === 'types' || raw === 'layouts') return raw;
  return 'templates';
}

export function DocumentTemplateListPage() {
  const confirm = useConfirm();
  const { workspaceId: routeWs } = useParams<{ workspaceId: string }>();
  const { scope } = useScope();
  const workspaceId = routeWs || scope?.workspaceId || '';
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const qc = useQueryClient();
  const { showToast } = useToast();
  const [createOpen, setCreateOpen] = useState(false);
  const [layoutCreateOpen, setLayoutCreateOpen] = useState(false);
  const createFromQueryHandled = useRef(false);
  const layoutCreateFromQueryHandled = useRef(false);
  const section = normalizeSection(searchParams.get('section'));
  const [form, setForm] = useState({
    name: '',
    app_id: '',
    document_type: '',
    category: '',
  });

  const listQ = useQuery({
    queryKey: ['document-templates', workspaceId],
    queryFn: () => documentsApi.listTemplates(),
    enabled: Boolean(workspaceId),
  });

  const layoutsQ = useQuery({
    queryKey: ['document-layouts', workspaceId],
    queryFn: () => documentsApi.listLayouts(),
    enabled: Boolean(workspaceId),
  });

  const appsQ = useQuery({
    queryKey: ['apps', workspaceId],
    queryFn: () => appsApi.list(),
    enabled: Boolean(workspaceId),
  });
  const apps = useMemo(
    () =>
      (appsQ.data || []).filter(
        a => !a.lifecycle_state || a.lifecycle_state === 'active',
      ),
    [appsQ.data],
  );

  const documentTypesQ = useDocumentTypes();
  const documentTypes = documentTypesQ.data || [];

  useEffect(() => {
    if (createFromQueryHandled.current) return;
    if (searchParams.get('create') !== '1') return;
    if (searchParams.get('section') === 'layouts') return;
    createFromQueryHandled.current = true;
    setCreateOpen(true);
    setSearchParams(
      prev => {
        const next = new URLSearchParams(prev);
        next.delete('create');
        return next;
      },
      { replace: true },
    );
  }, [searchParams, setSearchParams]);

  useEffect(() => {
    if (layoutCreateFromQueryHandled.current) return;
    if (searchParams.get('section') !== 'layouts') return;
    if (searchParams.get('create') !== '1') return;
    layoutCreateFromQueryHandled.current = true;
    setLayoutCreateOpen(true);
    setSearchParams(
      prev => {
        const next = new URLSearchParams(prev);
        next.delete('create');
        return next;
      },
      { replace: true },
    );
  }, [searchParams, setSearchParams]);

  useEffect(() => {
    if (!apps.length) return;
    setForm(f => {
      const nextAppId =
        f.app_id && apps.some(a => a.id === f.app_id) ? f.app_id : apps[0].id;
      const nextDocType =
        f.document_type ||
        documentTypes.find(dt => dt.code === 'employment_contract')?.code ||
        documentTypes[0]?.code ||
        '';
      if (f.app_id === nextAppId && f.document_type === nextDocType) return f;
      return { ...f, app_id: nextAppId, document_type: nextDocType };
    });
  }, [apps, documentTypes]);

  const createM = useMutation({
    mutationFn: () => {
      const app = apps.find(a => a.id === form.app_id);
      return documentsApi.createTemplate({
        name: form.name,
        app_id: form.app_id,
        module:
          resolveInstalledPackageSlug(app) || app?.name || form.app_id,
        document_type: form.document_type,
        category: form.category,
        context_type: '',
      });
    },
    onSuccess: tmpl => {
      qc.invalidateQueries({ queryKey: ['document-templates'] });
      setCreateOpen(false);
      navigate(`/workspaces/${workspaceId}/document-templates/${tmpl.id}/edit`);
    },
  });

  const deleteM = useMutation({
    mutationFn: (id: string) => documentsApi.deleteTemplate(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['document-templates'] });
      showToast('Template deleted', 'success');
    },
    onError: err => {
      showToast(agentiveErrorMessage(err, 'Could not delete template'), 'error');
    },
  });

  const templates = (listQ.data?.templates || []).filter(
    t => t.status !== 'archived',
  );

  useDocumentTemplatesPageContext(
    workspaceId && !listQ.isLoading
      ? {
          surface: 'list',
          workspaceId,
          templates,
          documentTypeCount: documentTypes.length,
          createDialogOpen: createOpen,
        }
      : null,
  );

  const setSection = (next: DocTemplatesSection) => {
    setSearchParams(
      prev => {
        const params = new URLSearchParams(prev);
        if (next === 'templates') params.delete('section');
        else params.set('section', next);
        params.delete('create');
        return params;
      },
      { replace: true },
    );
  };

  return (
    <PageShell>
      <PageSection>
        <div className="max-w-2xl">
          <PageHeading>Document Templates</PageHeading>
          <PageMeta as="p">
            Create and manage reusable document templates across apps.
          </PageMeta>
        </div>

        <ViewTabs<DocTemplatesSection>
          className="mt-6"
          ariaLabel="Document templates sections"
          value={section}
          onChange={setSection}
          actions={
            section === 'templates' ? (
              <Button className="shrink-0" onClick={() => setCreateOpen(true)}>
                Create template
              </Button>
            ) : null
          }
          options={[
            {
              value: 'templates',
              label: 'Templates',
              icon: <FileStack size={15} strokeWidth={LINE_ICON_STROKE} />,
              count: templates.length,
            },
            {
              value: 'types',
              label: 'Document types',
              icon: <FileText size={15} strokeWidth={LINE_ICON_STROKE} />,
              count: documentTypes.length,
            },
            {
              value: 'layouts',
              label: 'Page layouts',
              icon: <LayoutTemplate size={15} strokeWidth={LINE_ICON_STROKE} />,
              count: layoutsQ.data?.total ?? null,
            },
          ]}
        />
      </PageSection>

      {section === 'types' ? (
        <PageSection className="mt-8">
          <DocumentTypesPanel />
        </PageSection>
      ) : null}

      {section === 'layouts' ? (
        <PageSection className="mt-8">
          <DocumentLayoutsPanel
            workspaceId={workspaceId}
            autoOpenCreate={layoutCreateOpen}
            onAutoOpenHandled={() => setLayoutCreateOpen(false)}
          />
        </PageSection>
      ) : null}

      {section === 'templates' ? (
      <PageSection className="mt-8">
        <h2 className="text-lg font-semibold mb-4 tracking-tight">Templates</h2>
        <div className="overflow-x-auto rounded-lg border border-[var(--panel-border)]">
          <table className="w-full text-sm">
            <Surface as="thead" tone="panel" border="none" radius="none" className="text-left">
              <tr>
                <th className="px-3 py-2">Template</th>
                <th className="px-3 py-2">App</th>
                <th className="px-3 py-2">Type</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Actions</th>
              </tr>
            </Surface>
            <tbody>
              {templates.map((t: DocumentTemplate) => (
                <tr key={t.id} className="border-t border-[var(--panel-border)]">
                  <td className="px-3 py-2">
                    <Link
                      className="text-[var(--link)] hover:text-[var(--link-hover)] hover:underline"
                      to={`/workspaces/${workspaceId}/document-templates/${t.id}/edit`}
                    >
                      {t.name}
                    </Link>
                    {t.is_default ? (
                      <Text as="span" variant="body-sm" tone="muted" className="ml-2">
                        default
                      </Text>
                    ) : null}
                  </td>
                  <td className="px-3 py-2">{t.module}</td>
                  <td className="px-3 py-2">{t.document_type}</td>
                  <td className="px-3 py-2">{t.status}</td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-1">
                      <HoverTooltip label="Edit">
                        <IconButton
                          label={`Edit ${t.name}`}
                          onClick={() => navigate(`/workspaces/${workspaceId}/document-templates/${t.id}/edit`)}
                        >
                          <Pencil size={14} strokeWidth={LINE_ICON_STROKE} aria-hidden />
                        </IconButton>
                      </HoverTooltip>
                      <HoverTooltip label="Version history">
                        <IconButton
                          label={`Version history for ${t.name}`}
                          onClick={() => navigate(`/workspaces/${workspaceId}/document-templates/${t.id}/versions`)}
                        >
                          <History size={14} strokeWidth={LINE_ICON_STROKE} aria-hidden />
                        </IconButton>
                      </HoverTooltip>
                      <HoverTooltip label="Delete">
                        <IconButton
                          tone="subtle"
                          disabled={deleteM.isPending}
                          label={`Delete ${t.name}`}
                          onClick={async () => {
                            if (await confirm({ title: 'Delete template?', message: `Delete “${t.name}”? This cannot be undone.`, confirmLabel: 'Delete', variant: 'danger' })) {
                              deleteM.mutate(t.id);
                            }
                          }}
                        >
                          <Trash2 size={14} strokeWidth={LINE_ICON_STROKE} aria-hidden />
                        </IconButton>
                      </HoverTooltip>
                    </div>
                  </td>
                </tr>
              ))}
              {!listQ.isLoading && templates.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-3 py-8 text-center">
                    <Text variant="body" tone="muted">
                      No templates yet. Create one to get started.
                    </Text>
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </PageSection>
      ) : null}

      <FormDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Create document template"
        submitLabel="Create"
        submitDisabled={!form.app_id}
        submitLoading={createM.isPending}
        onSubmit={e => {
          e.preventDefault();
          createM.mutate();
        }}
      >
        <div className="space-y-3">
          <Field label="Name" htmlFor="doc-template-name">
            <Input
              id="doc-template-name"
              value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
            />
          </Field>
          <Field label="App" htmlFor="doc-template-app">
            <AppSelect
              id="doc-template-app"
              value={form.app_id}
              disabled={!apps.length}
              onValueChange={appId => setForm(f => ({ ...f, app_id: appId }))}
              placeholder={apps.length ? 'Select app…' : 'No installed apps'}
              className="app-input"
              options={[
                {
                  value: '',
                  label: apps.length ? 'Select app…' : 'No installed apps',
                  disabled: !apps.length,
                },
                ...apps.map(app => ({
                  value: app.id,
                  label: app.name,
                })),
              ]}
            />
          </Field>
          {!appsQ.isLoading && !apps.length ? (
            <Text variant="body-sm" tone="muted">
              Install an app in this workspace, then come back to create a
              template. You will pick a track and its fields while editing.
            </Text>
          ) : (
            <Text variant="body-sm" tone="muted">
              After creating, open the template and choose a track from this app
              to insert its fields.
            </Text>
          )}
          <Field label="Document type" htmlFor="doc-template-type">
            <DocumentTypeSelect
              id="doc-template-type"
              value={form.document_type}
              options={documentTypes}
              disabled={documentTypesQ.isLoading || !documentTypes.length}
              onValueChange={code =>
                setForm(f => ({ ...f, document_type: code }))
              }
            />
          </Field>
          {!documentTypesQ.isLoading && !documentTypes.length ? (
            <Text variant="body-sm" tone="muted">
              Add at least one document type in the section above before creating
              a template.
            </Text>
          ) : null}
          <Field label="Category" htmlFor="doc-template-category">
            <Input
              id="doc-template-category"
              value={form.category}
              onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
            />
          </Field>
          {createM.isError ? (
            <p className="text-sm text-red-600">
              {(createM.error as Error)?.message || 'Failed to create'}
            </p>
          ) : null}
        </div>
      </FormDialog>
    </PageShell>
  );
}
