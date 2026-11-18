import type { Crumb } from '../ui';

/** The label pages publish while their record loads. */
export const LOADING_LABEL = 'Loading…';

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
  if (top === 'workspaces' && pathname.split('/').filter(Boolean).length > 1) {
    prefix.push({ label: 'Workspaces', to: '/workspaces' });
  }
  // While a page is still loading its record, the active workspace is the PREVIOUS
  // page's: naming it would show the wrong workspace for several seconds. Say nothing
  // until the page publishes its real trail (it also switches the scope then).
  const loading = crumbs.length > 0 && crumbs[crumbs.length - 1].label === LOADING_LABEL;
  const hasPublishedWorkspace = crumbs.some(c => /^\/workspaces\/[^/]+$/.test(c.to ?? ''));
  const showWorkspace =
    !isHomePath &&
    !loading &&
    !hasPublishedWorkspace &&
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
    if (c.to === '/' || (isHomePath && c.label === 'Home')) return false;
    // Only drop a page-published workspace name when we already injected one.
    if (
      showWorkspace &&
      activeWorkspace?.name &&
      c.to === `/workspaces/${activeWorkspace.id}`
    ) {
      return false;
    }
    return true;
  });

  return [...prefix, ...tail];
}
