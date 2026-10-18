import type { SavedView } from '../../types';

/** Match a track saved view to a manifest / contribution view key. */
export function matchSavedViewByKey(
  views: SavedView[],
  viewKey: string
): SavedView | undefined {
  const key = String(viewKey || '').trim();
  if (!key || !views.length) return undefined;
  const keyLower = key.toLowerCase();
  const slug = keyLower.replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');

  return (
    views.find(
      v =>
        String(
          (v.config as { _manifest_view_key?: string } | undefined)
            ?._manifest_view_key || ''
        ) === key
    ) ||
    views.find(v => (v as SavedView & { key?: string }).key === key) ||
    views.find(v => (v.name || '').toLowerCase() === keyLower) ||
    views.find(v => {
      const nameSlug = (v.name || '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_|_$/g, '');
      return nameSlug === slug || nameSlug === keyLower;
    })
  );
}

/** Prefer an explicit contribution key; else first layout_container on the track. */
export function resolveDesignerTargetView(
  views: SavedView[],
  contributionViewKey: string | null | undefined
): SavedView | null {
  if (contributionViewKey) {
    const matched = matchSavedViewByKey(views, contributionViewKey);
    if (matched) return matched;
  }
  const layouts = views.filter(
    v => String(v.type || '').toLowerCase() === 'layout_container'
  );
  if (layouts.length === 1) return layouts[0];
  // Prefer hidden document shells (typical for owns_form contributions).
  const hidden = layouts.find(v => Boolean(v.hidden));
  return hidden || layouts[0] || null;
}

export function viewMissingManifestKey(view: SavedView): boolean {
  const key = String(
    (view.config as { _manifest_view_key?: string } | undefined)
      ?._manifest_view_key || ''
  ).trim();
  return !key;
}
