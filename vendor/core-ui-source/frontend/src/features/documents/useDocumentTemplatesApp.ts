import { useQuery } from '@tanstack/react-query';
import { appsApi } from '../../api';
import { isDocumentTemplatesApp } from './documentTemplatesRouting';

/** True when the Document Templates library app is installed in the active workspace. */
export function useDocumentTemplatesAppInstalled() {
  const query = useQuery({
    queryKey: ['apps', 'document-templates-installed'],
    queryFn: () => appsApi.list(),
    staleTime: 60_000,
  });

  const app = (query.data ?? []).find(
    a =>
      isDocumentTemplatesApp(a) &&
      (a.lifecycle_state || 'active') !== 'uninstalled',
  );

  return {
    isInstalled: Boolean(app),
    app,
    isLoading: query.isLoading,
  };
}
