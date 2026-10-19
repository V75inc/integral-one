import { describe, expect, it } from 'vitest';
import { routeForRelationTarget } from '../routeForRelationTarget';

describe('routeForRelationTarget', () => {
  it('builds entry routes without parent context', () => {
    expect(
      routeForRelationTarget({
        id: 'e1',
        label: 'Contoso',
        kind: 'entry',
        trackId: 't-contacts',
      })
    ).toBe('/tracks/t-contacts?entry=e1');
  });

  it('preserves from_* parent context for breadcrumbs', () => {
    const href = routeForRelationTarget(
      {
        id: 'e-contact',
        label: 'Contoso Corp',
        kind: 'entry',
        trackId: 't-contacts',
      },
      {
        fromEntryId: 'e-proj',
        fromTrackId: 't-projects',
        fromTitle: 'Contoso e-commerce',
      }
    );
    expect(href).toContain('/tracks/t-contacts?');
    expect(href).toContain('entry=e-contact');
    expect(href).toContain('from_entry=e-proj');
    expect(href).toContain('from_track=t-projects');
    expect(href).toContain('from_title=Contoso+e-commerce');
  });

  it('routes track targets without query params', () => {
    expect(
      routeForRelationTarget({
        id: 't-details',
        label: 'Details',
        kind: 'track',
      })
    ).toBe('/tracks/t-details');
  });
});
