import { describe, expect, it } from 'vitest';
import { stitchLayoutCrumbs } from '../stitchLayoutCrumbs';

describe('stitchLayoutCrumbs', () => {
  it('keeps a page-published workspace crumb on /workspaces/:id/members', () => {
    const trail = stitchLayoutCrumbs(
      [
        { label: 'Acme Org', to: '/workspaces/ws-1' },
        { label: 'Members' },
      ],
      '/workspaces/ws-1/members',
      { id: 'ws-1', name: 'Acme Org' },
    );
    expect(trail.map(c => c.label)).toEqual(['Home', 'Acme Org', 'Members']);
    expect(trail[1].to).toBe('/workspaces/ws-1');
  });

  it('dedupes workspace name only when Layout injects a workspace prefix', () => {
    const trail = stitchLayoutCrumbs(
      [
        { label: 'Acme Org', to: '/workspaces/ws-1' },
        { label: 'Apps' },
      ],
      '/apps',
      { id: 'ws-1', name: 'Acme Org' },
    );
    expect(trail.map(c => c.label)).toEqual(['Home', 'Acme Org', 'Apps']);
  });
});
