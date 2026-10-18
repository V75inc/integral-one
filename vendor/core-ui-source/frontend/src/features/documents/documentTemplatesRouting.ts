import type { App, Track } from '../../types';

export const DOCUMENT_TEMPLATES_APP_SLUG = 'document_templates';

export type AppPackageSlugSource = Pick<
  App,
  'source_operational_model_slug' | 'name'
>;

/** Operational-model package slug (Core) or legacy monolith profile slug. */
export function resolveInstalledPackageSlug(
  app?: AppPackageSlugSource | null,
): string {
  const fromModel = String(app?.source_operational_model_slug || '').trim();
  if (fromModel) return fromModel;
  const name = String(app?.name || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');
  return name;
}

export function isDocumentTemplatesApp(
  app?: AppPackageSlugSource | null,
): boolean {
  return (
    resolveInstalledPackageSlug(app).toLowerCase() ===
    DOCUMENT_TEMPLATES_APP_SLUG
  );
}

/** Manifest track keys routed to the dedicated document-templates UI. */
export const DOCUMENT_TEMPLATES_MANAGED_TRACK_KEYS = new Set([
  'templates',
  'document_types',
  'layouts',
]);

export function isDocumentTemplatesManagedTrack(
  track: Pick<Track, 'template_id'> | null | undefined,
  appSlug?: string | null,
): boolean {
  const slug = (appSlug || '').trim().toLowerCase();
  if (!track || slug !== DOCUMENT_TEMPLATES_APP_SLUG) return false;
  const key = String(track.template_id || '').trim();
  return DOCUMENT_TEMPLATES_MANAGED_TRACK_KEYS.has(key);
}

export function documentTemplatesListPath(
  workspaceId: string,
  opts?: { create?: boolean; section?: 'layouts' | 'types' | 'templates' },
): string {
  const base = `/workspaces/${workspaceId}/document-templates`;
  const params = new URLSearchParams();
  if (opts?.section) params.set('section', opts.section);
  if (opts?.create) params.set('create', '1');
  const qs = params.toString();
  return qs ? `${base}?${qs}` : base;
}

export function documentTemplatesEditorPath(
  workspaceId: string,
  templateId: string,
): string {
  return `/workspaces/${workspaceId}/document-templates/${templateId}/edit`;
}

/** Track list href — custom UI for managed tracks, generic track detail otherwise. */
export function resolveDocumentTemplatesTrackHref(
  track: Track,
  app?: AppPackageSlugSource & Pick<App, 'workspace_id'> | null,
): string {
  const appSlug =
    resolveInstalledPackageSlug(app) ||
    resolveInstalledPackageSlug(track.app ?? null);
  if (!isDocumentTemplatesManagedTrack(track, appSlug)) {
    return `/tracks/${track.id}`;
  }
  const workspaceId =
    track.workspace_id || app?.workspace_id || track.app?.workspace_id || '';
  if (!workspaceId) return `/tracks/${track.id}`;
  const trackKey = String(track.template_id || '').trim();
  if (trackKey === 'layouts') {
    return documentTemplatesListPath(workspaceId, { section: 'layouts' });
  }
  if (trackKey === 'document_types') {
    return documentTemplatesListPath(workspaceId, { section: 'types' });
  }
  return documentTemplatesListPath(workspaceId);
}

/** Redirect target when landing on a managed track via /tracks/:id. */
export function resolveDocumentTemplatesTrackRedirect(
  track: Track,
  searchParams: URLSearchParams,
): string | null {
  const appSlug = resolveInstalledPackageSlug(track.app ?? null);
  if (!isDocumentTemplatesManagedTrack(track, appSlug)) return null;

  const workspaceId =
    track.workspace_id || track.app?.workspace_id || '';
  if (!workspaceId) return null;

  const trackKey = String(track.template_id || '').trim();
  const entryId = searchParams.get('entry')?.trim();

  if (trackKey === 'templates' && entryId) {
    return documentTemplatesEditorPath(workspaceId, entryId);
  }
  if (trackKey === 'templates' && searchParams.get('create') === '1') {
    return documentTemplatesListPath(workspaceId, { create: true });
  }
  if (trackKey === 'layouts') {
    if (searchParams.get('create') === '1') {
      return documentTemplatesListPath(workspaceId, {
        section: 'layouts',
        create: true,
      });
    }
    return documentTemplatesListPath(workspaceId, { section: 'layouts' });
  }
  return documentTemplatesListPath(workspaceId);
}
