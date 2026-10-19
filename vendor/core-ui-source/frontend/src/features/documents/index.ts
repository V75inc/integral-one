export { documentsApi } from './api';
export type {
  DocumentFieldSpec,
  DocumentTemplate,
  DocumentTemplateVersion,
  GeneratedDocument,
} from './api';
export { DocumentTemplateListPage } from './DocumentTemplateListPage';
export { DocumentTemplateEditorPage } from './DocumentTemplateEditorPage';
export { TemplateVersionHistoryPage } from './TemplateVersionHistoryPage';
export { GenerateDocumentModal, GenerateDocumentButton } from './GenerateDocumentModal';
export { GeneratedDocumentsList } from './GeneratedDocumentsList';
export { DocumentTemplatesSettingsLink } from './DocumentTemplatesSettingsLink';
export { useDocumentTemplatesAppInstalled } from './useDocumentTemplatesApp';
export {
  documentTemplateVisibleEntries,
  useDocumentTemplatesPageContext,
} from './useDocumentTemplatesPageContext';
export {
  documentTemplatesEditorPath,
  documentTemplatesListPath,
  isDocumentTemplatesManagedTrack,
  resolveDocumentTemplatesTrackHref,
  resolveDocumentTemplatesTrackRedirect,
} from './documentTemplatesRouting';
export { contractTemplateIdFromFields, relationEntryId } from './relationEntryId';
