import type { Crumb } from '../ui';

const CRUMBS_SUPPRESSED: ReadonlySet<string> = new Set(['agent']);

const WORKSPACE_EXEMPT: ReadonlySet<string> = new Set([
  'profile',
  'settings',
  'notifications',
  'shared',
  'workspaces',
  'approvals',
  'background-tasks',
  'invitations',
  'admin',
]);

/** Stitch Home [› Workspace] › page trail for the TopBar. */
export function stitchLayoutCrumbs(
  crumbs: Crumb[],
  pathname: string,
  activeWorkspace?: { id?: string; name?: string } | null,
): Crumb[] {
  const isHomePath = pathname === '/';
  const top = pathname.split('/').filter(Boolean)[0] ?? '';
  if (CRUMBS_SUPPRESSED.has(top)) return [];

  const prefix: Crumb[] = [
    isHomePath ? { label: 'Home' } : { label: 'Home', to: '/' },
  ];
  const showWorkspace =
    !isHomePath &&
    !WORKSPACE_EXEMPT.has(top) &&
    Boolean(activeWorkspace?.id) &&
    Boolean(activeWorkspace?.name);
  if (showWorkspace && activeWorkspace?.id && activeWorkspace.name) {
    prefix.push({
      label: activeWorkspace.name,
      to: `/workspaces/${activeWorkspace.id}`,
    });
  }

  const tail = crumbs.filter(c => {
    if (c.label === 'Home') return false;
    // Only drop a page-published workspace name when we already injected one.
    if (
      showWorkspace &&
      activeWorkspace?.name &&
      c.label === activeWorkspace.name
    ) {
      return false;
    }
    return true;
  });

  return [...prefix, ...tail];
}
