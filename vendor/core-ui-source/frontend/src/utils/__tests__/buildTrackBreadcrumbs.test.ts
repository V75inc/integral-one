import { describe, expect, it } from 'vitest';
import { buildTrackBreadcrumbs } from '../buildTrackBreadcrumbs';
import type { Track } from '../../types';

function baseTrack(over: Partial<Track> = {}): Track {
  return {
    id: 't-projects',
    title: 'Projects',
    visibility: 'private',
    owner_id: 'u1',
    created_at: '2026-01-01T00:00:00Z',
    app: {
      id: 'a-proj',
      name: 'Projects',
      visibility: 'private',
    },
    ...over,
  };
}

describe('buildTrackBreadcrumbs', () => {
  it('keeps Apps › App › Track for App-owned tracks', () => {
    const crumbs = buildTrackBreadcrumbs(baseTrack({ title: 'Boards' }));
    expect(crumbs.map(c => c.label)).toEqual(['Apps', 'Projects', 'Boards']);
    expect(crumbs[0].to).toBe('/apps');
  });

  it('retains distinct App and Track when their labels match', () => {
    const crumbs = buildTrackBreadcrumbs(baseTrack());
    expect(crumbs.map(c => c.label)).toEqual(['Apps', 'Projects', 'Projects']);
  });

  it('says only Loading while the Track is not known yet', () => {
    expect(buildTrackBreadcrumbs(null).map(c => c.label)).toEqual(['Tracks', 'Loading…']);
  });

  it('inserts parent track and project for anchored details', () => {
    const crumbs = buildTrackBreadcrumbs(
      baseTrack({
        id: 't-details',
        title: 'Project Details: JVConnect',
        anchor_source: {
          entry_id: 'e-proj',
          entry_title: 'JVConnect',
          track_id: 't-projects',
          track_title: 'Internal Projects',
          field_key: 'details_track',
        },
      })
    );
    expect(crumbs.map(c => c.label)).toEqual([
      'Apps',
      'Projects',
      'Internal Projects',
      'JVConnect',
      'Details',
    ]);
    expect(crumbs[2].to).toBe('/tracks/t-projects');
    expect(crumbs[3].to).toBe('/tracks/t-projects?entry=e-proj');
  });

  it('humanizes financials_track and contracts_track leaves', () => {
    const fin = buildTrackBreadcrumbs(
      baseTrack({
        id: 't-fin',
        title: 'Project Financials: Contoso',
        anchor_source: {
          entry_id: 'e1',
          entry_title: 'Contoso',
          track_id: 't-projects',
          track_title: 'Projects',
          field_key: 'financials_track',
        },
      })
    );
    expect(fin.map(c => c.label)).toContain('Financials');

    const legal = buildTrackBreadcrumbs(
      baseTrack({
        id: 't-legal',
        title: 'Contracts & Legal: Contoso',
        anchor_source: {
          entry_id: 'e1',
          entry_title: 'Contoso',
          track_id: 't-projects',
          track_title: 'Projects',
          field_key: 'contracts_track',
        },
      })
    );
    expect(legal.map(c => c.label)).toContain('Contracts');
  });

  it('appends open entry title and keeps leaf linked', () => {
    const crumbs = buildTrackBreadcrumbs(
      baseTrack({
        id: 't-details',
        title: 'Project Details: Contoso',
        anchor_source: {
          entry_id: 'e-proj',
          entry_title: 'Contoso',
          track_id: 't-projects',
          track_title: 'Internal Projects',
          field_key: 'details_track',
        },
      }),
      { entryTitle: 'Ship login hardening' }
    );
    expect(crumbs.map(c => c.label)).toEqual([
      'Apps',
      'Projects',
      'Internal Projects',
      'Contoso',
      'Details',
      'Ship login hardening',
    ]);
    expect(crumbs[4].to).toBe('/tracks/t-details');
  });

  it('inserts from-parent when drilling Project → Contact', () => {
    const crumbs = buildTrackBreadcrumbs(
      baseTrack({
        id: 't-contacts',
        title: 'Contacts',
        app: {
          id: 'a-crm',
          name: 'CRM',
          visibility: 'private',
        },
      }),
      {
        from: {
          entryId: 'e-proj',
          trackId: 't-projects',
          title: 'Contoso e-commerce',
        },
        entryTitle: 'Contoso Corp',
      }
    );
    expect(crumbs.map(c => c.label)).toEqual([
      'Apps',
      'CRM',
      'Contoso e-commerce',
      'Contacts',
      'Contoso Corp',
    ]);
    expect(crumbs[2].to).toBe('/tracks/t-projects?entry=e-proj');
  });
});

it('retains standalone Track and entry hierarchy', () => {
  const crumbs = buildTrackBreadcrumbs(baseTrack({ app: undefined }), { entryTitle: 'Record' });
  expect(crumbs.map(c => c.label)).toEqual(['Tracks', 'Projects', 'Record']);
  expect(crumbs[1].to).toBe('/tracks/t-projects');
});

it('keeps Tracks parent for standalone relation and anchored trails', () => {
  const from = { entryId: 'e', trackId: 'parent', title: 'Parent' };
  expect(buildTrackBreadcrumbs(baseTrack({ app: undefined }), { from })[0]).toEqual({ label: 'Tracks', to: '/tracks' });
  const track = baseTrack({ app: undefined, anchor_source: { entry_id: 'e', entry_title: 'Parent', track_id: 'parent', field_key: 'details' } });
  expect(buildTrackBreadcrumbs(track)[0]).toEqual({ label: 'Tracks', to: '/tracks' });
});
