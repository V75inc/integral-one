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
    expect(trail.map(c => c.label)).toEqual(['Home', 'Workspaces', 'Acme Org', 'Members']);
    expect(trail[1].to).toBe('/workspaces');
    expect(trail[2].to).toBe('/workspaces/ws-1');
  });

  it('links to Workspaces from a workspace detail but does not duplicate the list page', () => {
    expect(stitchLayoutCrumbs([{ label: 'Acme' }], '/workspaces/ws-1')).toEqual([
      { label: 'Home', to: '/' }, { label: 'Workspaces', to: '/workspaces' }, { label: 'Acme' },
    ]);
    expect(stitchLayoutCrumbs([{ label: 'Workspaces' }], '/workspaces')).toEqual([
      { label: 'Home', to: '/' }, { label: 'Workspaces' },
    ]);
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

  it('names no workspace while the page is still loading its record', () => {
    // The active workspace is still the previous page's until the record loads.
    const trail = stitchLayoutCrumbs(
      [{ label: 'Tracks', to: '/tracks' }, { label: 'Loading…' }],
      '/tracks/t-1',
      { id: 'ws-old', name: 'Previous Workspace' },
    );
    expect(trail.map(c => c.label)).toEqual(['Home', 'Tracks', 'Loading…']);
  });
});

it('prefers the resolved resource workspace over stale active scope', () => {
  const result = stitchLayoutCrumbs([
    { label: 'Target', to: '/workspaces/new' }, { label: 'Apps', to: '/apps' }, { label: 'Example' },
  ], '/apps/example', { id: 'old', name: 'Previous' });
  expect(result.map(c => c.label)).toEqual(['Home', 'Target', 'Apps', 'Example']);
});
it('does not drop an App whose label matches its workspace', () => {
  const result = stitchLayoutCrumbs([{ label: 'Same' }], '/apps/example', { id: 'ws', name: 'Same' });
  expect(result.map(c => c.label)).toEqual(['Home', 'Same', 'Same']);
});

it('retains a resource named Home while deduplicating an actual root link', () => {
  expect(stitchLayoutCrumbs([{ label: 'Home', to: '/' }, { label: 'Home' }], '/apps/a').map(c => c.label)).toEqual(['Home', 'Home']);
});
