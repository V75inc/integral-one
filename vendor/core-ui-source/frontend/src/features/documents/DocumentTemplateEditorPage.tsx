import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from 'react-router-dom';
import type { Editor } from '@tiptap/react';
import type { App } from '../../types';
import { PageHeading, PageShell, PageSection, Button } from '../../components/ui';
import { Input, Text } from '../../ui';
import { Field } from '../../patterns/Field';
import { documentsApi, type DocumentFieldSpec } from './api';
import { appsApi } from '../../api/apps';
import { DocumentTypeSelect } from './DocumentTypeSelect';
import { useDocumentTypes } from './useDocumentTypes';
import { DocumentTemplateEditor } from './editor/DocumentTemplateEditor';
import { FieldBrowserPanel } from './FieldBrowserPanel';
import { FieldTokenConfigPanel } from './FieldTokenConfigPanel';
import { SignatureBlockConfigPanel } from './SignatureBlockConfigPanel';
import { TemplatePreviewPanel } from './TemplatePreviewPanel';
import { PageSetupPanel, type PageSettings } from './PageSetupPanel';
import {
  DEFAULT_MARGINS_IN,
  DEFAULT_PAGE_SIZE,
  type MarginsInches,
  type PageSizeKey,
} from './documentTheme';
import { useToast } from '../../context/ToastContext';
import { agentiveErrorMessage } from '../../api/helpers';
import {
  formatFieldRefDisplay,
  qualifyFieldRef,
  qualifyFieldTokensInDocument,
  slugRefPart,
} from './fieldRef';
import { useDocumentTemplatesPageContext } from './useDocumentTemplatesPageContext';

import { resolveInstalledPackageSlug } from './documentTemplatesRouting';

function moduleSlugForApp(app: App | undefined): string {
  if (!app) return '';
  return (
    resolveInstalledPackageSlug(app) || slugRefPart(app.name) || ''
  ).trim();
}

function syncTokenMetadata(
  editorDoc: Record<string, unknown>,
  existing: { tokens?: Array<Record<string, unknown>>; signatures?: Array<Record<string, unknown>> },
) {
  const tokens: Array<Record<string, unknown>> = [];
  const signatures: Array<Record<string, unknown>> = [];
  const walk = (node: unknown) => {
    if (!node || typeof node !== 'object') return;
    const n = node as Record<string, unknown>;
    if (n.type === 'fieldToken') {
      const attrs = (n.attrs || {}) as Record<string, unknown>;
      tokens.push({
        id: String(attrs.fieldKey || ''),
        field_key: attrs.fieldKey,
        label: attrs.label,
        format: attrs.format,
        fallback: attrs.fallback,
        missing_policy: attrs.missingPolicy,
      });
    }
    if (n.type === 'signaturePlaceholder') {
      const attrs = (n.attrs || {}) as Record<string, unknown>;
      signatures.push({
        role: attrs.role,
        label: attrs.label,
        mode: attrs.mode || 'runtime',
        width: attrs.width || 220,
        height: attrs.height || 48,
        embedded_png_b64: attrs.embeddedPngB64 || '',
        embedded_attachment_id: attrs.embeddedAttachmentId || '',
      });
    }
    for (const c of (n.content as unknown[]) || []) walk(c);
  };
  walk(editorDoc);
  for (const t of existing.tokens || []) {
    const key = String(t.field_key || t.fieldKey || '');
    if (key && !tokens.some(x => String(x.field_key) === key)) tokens.push(t);
  }
  return { tokens, signatures };
}

export function DocumentTemplateEditorPage() {
  const { workspaceId = '', templateId = '' } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { showToast } = useToast();
  const [editorDoc, setEditorDoc] = useState<Record<string, unknown>>({
    type: 'doc',
    content: [{ type: 'paragraph' }],
  });
  const [selectedToken, setSelectedToken] = useState<Record<string, unknown> | null>(
    null,
  );
  const [selectedSignature, setSelectedSignature] = useState<Record<string, unknown> | null>(
    null,
  );
  const [fieldQuery, setFieldQuery] = useState('');
  const [editor, setEditor] = useState<Editor | null>(null);
  const editorDocDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [versionId, setVersionId] = useState('');
  const [dirty, setDirty] = useState(false);
  const [pageSettings, setPageSettings] = useState<PageSettings>({
    layoutId: '',
    pageSize: DEFAULT_PAGE_SIZE,
    margins: { ...DEFAULT_MARGINS_IN },
    pageNumbers: true,
    headerHtml: '',
    footerHtml: '',
  });
  const onPageSettingsChange = useCallback((settings: PageSettings) => {
    setPageSettings(settings);
  }, []);
  const [name, setName] = useState('');
  const [documentType, setDocumentType] = useState('');

  const detailQ = useQuery({
    queryKey: ['document-template', templateId],
    queryFn: () => documentsApi.getTemplate(templateId),
    enabled: Boolean(templateId),
  });

  const editingVersion =
    detailQ.data?.draft_version || detailQ.data?.current_version || null;

  const tmpl = detailQ.data?.template;

  useDocumentTemplatesPageContext(
    workspaceId && templateId && tmpl
      ? {
          surface: 'editor',
          workspaceId,
          template: tmpl,
          versionId: editingVersion?.id,
          versionStatus: editingVersion?.status,
        }
      : null,
  );

  const appsQ = useQuery({
    queryKey: ['apps', workspaceId],
    queryFn: () => appsApi.list(),
    enabled: Boolean(workspaceId),
  });
  const installedApps = useMemo(
    () =>
      (appsQ.data || []).filter(
        a => !a.lifecycle_state || a.lifecycle_state === 'active',
      ),
    [appsQ.data],
  );
  const documentTypesQ = useDocumentTypes();
  const documentTypes = documentTypesQ.data || [];
  const [fieldsAppId, setFieldsAppId] = useState('');
  const [fieldsTrackId, setFieldsTrackId] = useState('');
  const fieldsSourceInit = useRef(false);

  useEffect(() => {
    if (fieldsSourceInit.current || !installedApps.length) return;
    fieldsSourceInit.current = true;
    const tpl = detailQ.data?.template;
    const fromTemplateApp = tpl?.app_id
      ? installedApps.find(a => a.id === tpl.app_id)?.id
      : undefined;
    const fromModule = tpl?.module
      ? installedApps.find(
          a =>
            resolveInstalledPackageSlug(a) === tpl.module ||
            a.name === tpl.module ||
            slugRefPart(a.name) === tpl.module,
        )?.id
      : undefined;
    setFieldsAppId(fromTemplateApp || fromModule || installedApps[0]?.id || '');
    if (tpl?.track_id) setFieldsTrackId(tpl.track_id);
  }, [detailQ.data?.template, installedApps]);

  const tracksQ = useQuery({
    queryKey: ['app-tracks', fieldsAppId],
    queryFn: () => appsApi.listTracks(fieldsAppId),
    enabled: Boolean(fieldsAppId),
  });

  useEffect(() => {
    if (!editingVersion) return;
    setVersionId(editingVersion.id);
    if (editingVersion.editor_document) {
      setEditorDoc(editingVersion.editor_document);
    }
  }, [editingVersion?.id, editingVersion?.updated_at]);

  useEffect(() => {
    if (!tmpl?.module || !tmpl.context_type) return;
    setEditorDoc(doc =>
      qualifyFieldTokensInDocument(doc, {
        module: tmpl.module,
        trackKey: tmpl.context_type,
      }),
    );
  }, [tmpl?.module, tmpl?.context_type]);

  useEffect(() => {
    const next = detailQ.data?.template.name || '';
    if (next) setName(next);
  }, [detailQ.data?.template.name]);

  useEffect(() => {
    setDocumentType(detailQ.data?.template.document_type ?? '');
  }, [detailQ.data?.template.document_type]);

  const selectedFieldsApp = useMemo(
    () => installedApps.find(a => a.id === fieldsAppId),
    [fieldsAppId, installedApps],
  );

  const fieldsQ = useQuery({
    queryKey: ['document-fields', fieldsAppId, fieldsTrackId, fieldQuery],
    queryFn: () =>
      documentsApi.listFields({
        module: moduleSlugForApp(selectedFieldsApp) || detailQ.data?.template.module,
        track_id: fieldsTrackId,
        q: fieldQuery || undefined,
      }),
    enabled: Boolean(fieldsTrackId),
  });

  const onSelectFieldsApp = useCallback((nextAppId: string) => {
    setFieldsAppId(nextAppId);
    setFieldsTrackId('');
    setFieldQuery('');
  }, []);

  const onSelectFieldsTrack = useCallback((nextTrackId: string) => {
    setFieldsTrackId(nextTrackId);
    setFieldQuery('');
  }, []);

  const persistDocumentType = useCallback(
    async (nextType: string) => {
      setDocumentType(nextType);
      if (!nextType || nextType === detailQ.data?.template.document_type) return;
      try {
        await documentsApi.updateTemplate(templateId, { document_type: nextType });
        qc.invalidateQueries({ queryKey: ['document-template', templateId] });
        qc.invalidateQueries({ queryKey: ['document-templates'] });
        showToast('Document type updated', 'success');
      } catch (err) {
        setDocumentType(detailQ.data?.template.document_type || '');
        showToast(agentiveErrorMessage(err, 'Could not update document type'), 'error');
      }
    },
    [
      detailQ.data?.template.document_type,
      qc,
      showToast,
      templateId,
    ],
  );

  const saveM = useMutation({
    mutationFn: async () => {
      let vid = versionId;
      const cur = editingVersion;
      if (!vid) throw new Error('No version');
      if (cur && cur.status === 'published' && cur.id === vid) {
        const draft = await documentsApi.createVersionDraft(templateId);
        vid = draft.id;
        setVersionId(vid);
      }
      const docForSave =
        (editor?.getJSON() as Record<string, unknown> | undefined) ?? editorDoc;
      const meta = syncTokenMetadata(
        docForSave,
        cur?.token_metadata || { tokens: [] },
      );
      if (name.trim() && name.trim() !== (detailQ.data?.template.name || '')) {
        await documentsApi.updateTemplate(templateId, { name: name.trim() });
      }
      return documentsApi.updateVersion(vid, {
        editor_document: docForSave,
        token_metadata: meta,
      });
    },
    onSuccess: () => {
      setDirty(false);
      qc.invalidateQueries({ queryKey: ['document-template', templateId] });
      showToast('Draft saved', 'success');
    },
    onError: err => {
      showToast(agentiveErrorMessage(err, 'Could not save draft'), 'error');
    },
  });

  const publishM = useMutation({
    mutationFn: async () => {
      const saved = await saveM.mutateAsync();
      const id = saved.id || versionId;
      setVersionId(id);
      return documentsApi.publishVersion(id);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['document-template', templateId] });
      showToast('Template published', 'success');
    },
    onError: err => {
      showToast(agentiveErrorMessage(err, 'Could not publish'), 'error');
    },
  });

  const deleteM = useMutation({
    mutationFn: () => documentsApi.deleteTemplate(templateId),
    onSuccess: () => {
      showToast('Template deleted', 'success');
      navigate(`/workspaces/${workspaceId}/document-templates`);
    },
    onError: err => {
      showToast(agentiveErrorMessage(err, 'Could not delete template'), 'error');
    },
  });

  const selectedFieldsTrack = (tracksQ.data || []).find(t => t.id === fieldsTrackId);

  useEffect(
    () => () => {
      if (editorDocDebounceRef.current) clearTimeout(editorDocDebounceRef.current);
    },
    [],
  );

  const onEditorDocChange = useCallback((doc: Record<string, unknown>) => {
    setDirty(true);
    if (editorDocDebounceRef.current) clearTimeout(editorDocDebounceRef.current);
    editorDocDebounceRef.current = setTimeout(() => {
      setEditorDoc(doc);
      editorDocDebounceRef.current = null;
    }, 100);
  }, []);

  const onInsertField = useCallback(
    (field: DocumentFieldSpec) => {
      if (!editor) return;
      const moduleSlug =
        field.module ||
        moduleSlugForApp(selectedFieldsApp) ||
        tmpl?.module ||
        'app';
      const trackKey =
        field.track_key ||
        selectedFieldsTrack?.template_id ||
        (selectedFieldsTrack?.title ? slugRefPart(selectedFieldsTrack.title) : '') ||
        'track';
      const fieldKey = qualifyFieldRef(field.field_ref || field.key, {
        module: moduleSlug,
        trackKey,
        localField: field.local_field_key,
      });
      const placeholder =
        field.placeholder && field.placeholder.includes('.')
          ? field.placeholder
          : formatFieldRefDisplay(fieldKey);
      editor
        .chain()
        .focus()
        .insertFieldToken({
          fieldKey,
          label: field.label,
          placeholder,
        })
        .run();
      setDirty(true);
    },
    [editor, selectedFieldsApp, selectedFieldsTrack?.template_id, selectedFieldsTrack?.title, tmpl?.module],
  );

  return (
    <PageShell>
      <PageSection className="doc-template-page-section">
        <div className="doc-template-editor-header">
          <div className="doc-template-editor-header__main">
            <PageHeading>{tmpl?.name || 'Edit template'}</PageHeading>
            <div className="mt-3 max-w-md">
              <Input
                aria-label="Template name"
                value={name}
                onChange={e => {
                  setName(e.target.value);
                  setDirty(true);
                }}
              />
            </div>
            <div className="mt-3 grid gap-3 sm:grid-cols-2 max-w-2xl">
              <Field label="Document type" htmlFor="doc-template-document-type">
                <DocumentTypeSelect
                  id="doc-template-document-type"
                  value={documentType}
                  options={documentTypes}
                  disabled={documentTypesQ.isLoading || !documentTypes.length}
                  onValueChange={code => {
                    void persistDocumentType(code);
                  }}
                />
              </Field>
              {tmpl?.module ? (
                <div>
                  <Text as="p" variant="label" className="mb-1.5">
                    App module
                  </Text>
                  <Text as="p" variant="body">{tmpl.module}</Text>
                </div>
              ) : null}
            </div>
            {!documentTypesQ.isLoading && !documentTypes.length ? (
              <Text as="p" variant="body" tone="muted" className="mt-2 max-w-2xl">
                Add document types on the Document Templates list page, then pick
                one here.
              </Text>
            ) : (
              <Text as="p" variant="body" tone="muted" className="mt-2">
                Pick an app and track in the sidebar to insert fields from any
                installed app.
              </Text>
            )}
          </div>
          <div className="doc-template-editor-header__actions">
            <Link
              className="doc-template-editor-header__back text-sm text-[var(--link)] hover:text-[var(--link-hover)]"
              to={`/workspaces/${workspaceId}/document-templates`}
            >
              Back
            </Link>
            <Button
              variant="secondary"
              disabled={!dirty || saveM.isPending}
              onClick={() => saveM.mutate()}
            >
              Save draft
            </Button>
            <Button disabled={publishM.isPending} onClick={() => publishM.mutate()}>
              Publish
            </Button>
            <Button
              variant="danger"
              disabled={deleteM.isPending}
              onClick={() => {
                if (
                  !window.confirm(
                    `Delete “${tmpl?.name || 'this template'}”? This cannot be undone.`,
                  )
                ) {
                  return;
                }
                deleteM.mutate();
              }}
            >
              Delete
            </Button>
          </div>
        </div>
      </PageSection>
      {dirty || editingVersion?.status === 'draft' ? (
        <PageSection className="doc-template-page-section mt-4 md:mt-5">
          <div
            className="rounded-[var(--radius-card)] border border-amber-500/35 bg-amber-500/10 px-4 py-3 max-w-page mx-auto"
            role="status"
          >
            <Text as="p" variant="body" weight="medium">Published version used for contracts</Text>
            <Text as="p" variant="body" tone="muted" className="mt-1">
              Onboarding and other generated PDFs use the last published template, not
              unsaved edits. Save draft, publish, then regenerate the contract on the
              onboarding form so candidates see your latest formatting.
            </Text>
          </div>
        </PageSection>
      ) : null}
      <PageSection
        className="doc-template-page-section mt-6 md:mt-8 space-y-5 md:space-y-6"
        innerClassName="max-w-none"
      >
        <PageSetupPanel
          workspaceId={workspaceId}
          versionId={versionId}
          version={editingVersion}
          onPageSettingsChange={onPageSettingsChange}
        />

        <FieldBrowserPanel
          fields={fieldsQ.data?.fields || []}
          loading={fieldsQ.isLoading}
          error={
            fieldsQ.isError
              ? agentiveErrorMessage(fieldsQ.error, 'Could not load fields')
              : undefined
          }
          onInsert={onInsertField}
          onSearch={setFieldQuery}
          apps={installedApps.map(a => ({ id: a.id, name: a.name }))}
          selectedAppId={fieldsAppId}
          onSelectApp={onSelectFieldsApp}
          appsLoading={appsQ.isLoading}
          tracks={(tracksQ.data || []).map(t => ({
            id: t.id,
            title: t.title,
          }))}
          selectedTrackId={fieldsTrackId}
          onSelectTrack={onSelectFieldsTrack}
          tracksLoading={tracksQ.isLoading}
        />

        <div className="doc-template-workspace">
          <div className="doc-template-workspace__editor">
            <DocumentTemplateEditor
              value={editorDoc}
              onChange={onEditorDocChange}
              onSelectToken={setSelectedToken}
              onSelectSignature={setSelectedSignature}
              onEditorReady={setEditor}
              pageSize={pageSettings.pageSize as PageSizeKey}
              margins={pageSettings.margins as MarginsInches}
            />
          </div>
          <aside className="doc-template-workspace__sidebar" aria-label="Template tools">
            <FieldTokenConfigPanel
              token={selectedToken}
              onChange={next => {
                editor?.chain().focus().updateFieldToken(next).run();
                setDirty(true);
                setSelectedToken(next);
              }}
              onRemove={() => {
                editor?.chain().focus().deleteSelection().run();
                setDirty(true);
                setSelectedToken(null);
              }}
            />
            <SignatureBlockConfigPanel
              block={selectedSignature}
              onChange={next => {
                editor?.chain().focus().updateSignaturePlaceholder(next).run();
                setDirty(true);
                setSelectedSignature(next);
              }}
              onRemove={() => {
                editor?.chain().focus().deleteSelection().run();
                setDirty(true);
                setSelectedSignature(null);
              }}
            />
          </aside>
        </div>

        <TemplatePreviewPanel
          templateId={templateId}
          versionId={versionId}
          contextType={tmpl?.context_type || 'employee'}
          editorDocument={editorDoc}
        />
        {(saveM.isError || publishM.isError) && (
          <p className="mt-3 text-sm text-red-600">
            {((saveM.error || publishM.error) as Error)?.message || 'Save failed'}
          </p>
        )}
      </PageSection>
    </PageShell>
  );
}
