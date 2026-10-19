import { useQuery } from '@tanstack/react-query';
import { documentsApi, type DocumentType } from './api';

export type DocumentTypeOption = Pick<
  DocumentType,
  'id' | 'code' | 'name' | 'description'
> & {
  /** Display label (alias for name). */
  title: string;
};

function toOption(row: DocumentType): DocumentTypeOption {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    title: row.name || row.code,
    description: row.description,
  };
}

/** Workspace document types from the Document Templates platform. */
export function useDocumentTypes(params?: { module?: string }) {
  return useQuery({
    queryKey: ['document-types', params?.module ?? ''],
    queryFn: async (): Promise<DocumentTypeOption[]> => {
      const { document_types } = await documentsApi.listDocumentTypes(params);
      return document_types.map(toOption);
    },
  });
}
