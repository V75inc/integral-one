import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { appsApi } from '../../api/apps';
import { usePublishPageContext } from '../../hooks/usePublishPageContext';
import { MAX_VISIBLE_CONTEXT_ITEMS } from '../../types/chatPageContext';
import type { DocumentTemplate } from './api';
import { useDocumentTemplatesAppInstalled } from './useDocumentTemplatesApp';

export type DocumentTemplatesPageContextInput =
  | {
      surface: 'list';
      workspaceId: string;
      templates: DocumentTemplate[];
      documentTypeCount: number;
      createDialogOpen?: boolean;
    }
  | {
      surface: 'editor';
      workspaceId: string;
      template: Pick<
        DocumentTemplate,
        'id' | 'name' | 'status' | 'document_type' | 'module' | 'track_id' | 'app_id'
      >;
      versionId?: string;
      versionStatus?: string;
    }
  | {
      surface: 'versions';
      workspaceId: string;
      templateId: string;
      templateName?: string;
      versionCount: number;
    };

/** Map visible templates to the same entry shape Track detail publishes. */
export function documentTemplateVisibleEntries(templates: DocumentTemplate[]) {
  const capped = templates.slice(0, MAX_VISIBLE_CONTEXT_ITEMS);
  return {
    entries: capped.map(t => ({
      id: t.id,
      title: t.name,
      status: t.status,
      entry_type: 'template',
    })),
    total_count:
      templates.length > MAX_VISIBLE_CONTEXT_ITEMS ? templates.length : undefined,
  };
}

export function useDocumentTemplatesPageContext(
  input: DocumentTemplatesPageContextInput | null,
): void {
  const { app } = useDocumentTemplatesAppInstalled();

  const tracksQ = useQuery({
    queryKey: ['app-tracks', app?.id, 'document-templates-context'],
    queryFn: () => appsApi.listTracks(app!.id),
    enabled: Boolean(app?.id && input?.workspaceId),
    staleTime: 60_000,
  });

  const templatesTrackId = useMemo(() => {
    const fromAppTracks = (tracksQ.data || []).find(
      t => t.template_id === 'templates',
    )?.id;
    if (fromAppTracks) return fromAppTracks;
    if (input?.surface === 'list') {
      return input.templates.find(t => t.track_id)?.track_id ?? null;
    }
    if (input?.surface === 'editor') {
      return input.template.track_id ?? null;
    }
    return null;
  }, [tracksQ.data, input]);

  const pageContext = useMemo(() => {
    if (!input?.workspaceId) return null;

    const baseMetadata = {
      workspace_id: input.workspaceId,
      app_slug: 'document_templates',
    };

    if (input.surface === 'list') {
      return {
        pageKind: 'document_templates_list',
        focusedAppId: app?.id ?? null,
        focusedTrackId: templatesTrackId,
        visibleData: documentTemplateVisibleEntries(input.templates),
        metadata: {
          ...baseMetadata,
          track_title: 'Templates',
          document_type_count: input.documentTypeCount,
          template_count: input.templates.length,
          create_dialog_open: Boolean(input.createDialogOpen),
        },
      };
    }

    if (input.surface === 'editor') {
      return {
        pageKind: 'document_template_editor',
        focusedAppId: input.template.app_id || app?.id || null,
        focusedTrackId: templatesTrackId,
        focusedEntryId: input.template.id,
        visibleData: documentTemplateVisibleEntries([input.template as DocumentTemplate]),
        metadata: {
          ...baseMetadata,
          template_name: input.template.name,
          document_type: input.template.document_type,
          consumer_module: input.template.module,
          template_status: input.template.status,
          version_id: input.versionId,
          version_status: input.versionStatus,
        },
      };
    }

    return {
      pageKind: 'document_template_versions',
      focusedAppId: app?.id ?? null,
      focusedTrackId: templatesTrackId,
      focusedEntryId: input.templateId,
      metadata: {
        ...baseMetadata,
        template_id: input.templateId,
        template_name: input.templateName,
        version_count: input.versionCount,
      },
    };
  }, [app?.id, input, templatesTrackId]);

  usePublishPageContext(pageContext);
}
