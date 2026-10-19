/**
 * Public barrel for the Plan 03 attachment surface.
 *
 * EntryDetail, EntryComposer, and any future attachment consumers
 * import from here — keeps the internal viewer split (viewers/*) an
 * implementation detail.
 *
 * Note: AttachmentDropzone has been retired in favor of
 * `../AddToEntryControl`, which now drives both the composer's edit
 * form and the read-only quick-attach surface inside EntryDetail.
 */
export { AttachmentGrid } from './AttachmentGrid';
export { AttachmentTile } from './AttachmentTile';
export { AttachmentRow } from './AttachmentRow';
export { AttachmentRowList } from './AttachmentRowList';
export { AttachmentViewerModal } from './AttachmentViewerModal';
export { MetadataPanel } from './MetadataPanel';
export {
  canViewInApp,
  resolveViewerKind,
  thumbnailSrc,
  formatDuration,
  shortHash,
} from './attachmentHelpers';
export type { ViewerKind } from './attachmentHelpers';
