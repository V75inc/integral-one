import type { App, OperationalModelNode } from '../../types';
import { getManifestScopeKind } from '../../lib/operationalModelManifest';

export function extractPackageMeta(profile: OperationalModelNode): {
  name: string;
  description: string;
  slug: string;
} {
  const manifest = profile.manifest || {};
  const pkg = (manifest.package as Record<string, unknown> | undefined) || {};
  const profileDesc = profile.description || '';
  const name = String(profile.name || pkg.name || '');
  const description = String(profileDesc || pkg.description || '');
  // The compiled manifest canonicalizes `package.name` to the slug value and
  // drops `package.slug` entirely (see operational_model_library_sync.py) —
  // the real slug survives only on the node as `metadata.slug`. Reading
  // `pkg.slug` here always came back empty post-compile, which silently
  // blanked the mono slug badge on every install-catalog row and broke
  // `isPackageInstalled`'s slug-based fallback match. `pkg.slug` stays as a
  // fallback for any manifest shape that hasn't gone through that compile.
  const slug = String(profile.metadata?.slug || pkg.slug || '');
  return { name, description, slug };
}

export function isBundleBackedApp(app: App): boolean {
  return Boolean(
    app.installed_from_library_id ||
      (app.source_operational_model_slug && app.source_operational_model_slug.trim()),
  );
}

export function installedLibraryIds(apps: App[]): Set<string> {
  return new Set(
    apps
      .map(a => a.installed_from_library_id || '')
      .filter(Boolean),
  );
}

export function installedBundleSlugs(apps: App[]): Set<string> {
  return new Set(
    apps
      .map(a => (a.source_operational_model_slug || '').trim().toLowerCase())
      .filter(Boolean),
  );
}

export function isPackageInstalled(
  profile: OperationalModelNode,
  apps: App[],
): boolean {
  const libIds = installedLibraryIds(apps);
  if (libIds.has(profile.id)) return true;
  const { slug } = extractPackageMeta(profile);
  if (!slug) return false;
  return installedBundleSlugs(apps).has(slug.toLowerCase());
}

export function filterAppScopedLibraryPackages(
  profiles: OperationalModelNode[],
): OperationalModelNode[] {
  return profiles.filter(p => {
    if (p.library_package === false) return false;
    const manifest = p.manifest || {};
    return getManifestScopeKind(manifest) === 'app';
  });
}

/** Platform packages (no workspace_id) plus private templates for this workspace. */
export function filterWorkspaceVisibleLibraryPackages(
  profiles: OperationalModelNode[],
  workspaceId: string | null | undefined,
): OperationalModelNode[] {
  return profiles.filter(p => {
    const pkgWs = String(p.workspace_id || '').trim();
    if (!pkgWs) return true;
    return Boolean(workspaceId) && pkgWs === workspaceId;
  });
}

export function lifecycleBadge(
  state?: App['lifecycle_state'],
): 'Active' | 'Needs settings' | 'Paused' | 'Installing' | null {
  switch (state) {
    case 'awaiting_settings':
      return 'Needs settings';
    case 'paused':
      return 'Paused';
    case 'installing':
      return 'Installing';
    case 'active':
      return 'Active';
    default:
      return state ? 'Active' : null;
  }
}
