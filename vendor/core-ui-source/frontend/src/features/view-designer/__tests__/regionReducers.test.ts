import { describe, expect, it } from 'vitest';
import {
  addFormRegion,
  addViewRegion,
  layoutConfigToRecord,
  removeRegion,
  reorderRegions,
  updateRegion,
} from '../regionReducers';
import type { RegionSpec } from '../viewDesignerTypes';

const sample: RegionSpec[] = [
  { key: 'header', kind: 'form', title: 'Header', fields: ['a', 'b'] },
  { key: 'lines', kind: 'view', title: 'Lines', view: 'lines_editor' },
  { key: 'notes', kind: 'form', title: 'Notes', fields: ['note'] },
];

describe('regionReducers', () => {
  it('reorders regions', () => {
    expect(reorderRegions(sample, 0, 2).map(r => r.key)).toEqual([
      'lines',
      'notes',
      'header',
    ]);
    expect(reorderRegions(sample, 1, 1)).toBe(sample);
  });

  it('removes a region by key', () => {
    expect(removeRegion(sample, 'lines').map(r => r.key)).toEqual([
      'header',
      'notes',
    ]);
  });

  it('updates form fields without flipping kind', () => {
    const next = updateRegion(sample, 'header', {
      title: 'Invoice header',
      fields: ['invoice_number'],
    } as Partial<RegionSpec>);
    expect(next[0]).toMatchObject({
      kind: 'form',
      key: 'header',
      title: 'Invoice header',
      fields: ['invoice_number'],
    });
  });

  it('adds form and view regions with unique keys', () => {
    const withForm = addFormRegion(sample, { title: 'Header', fields: ['x'] });
    expect(withForm[withForm.length - 1].key).toBe('header_2');
    const withView = addViewRegion(sample, { view: 'payment_options', title: 'Pay' });
    expect(withView[withView.length - 1]).toMatchObject({
      kind: 'view',
      view: 'payment_options',
      title: 'Pay',
    });
  });

  it('serializes layout config for save payload', () => {
    expect(
      layoutConfigToRecord({
        regions: sample,
        mode: 'stack',
        title: 'Document',
      })
    ).toEqual({
      regions: sample,
      mode: 'stack',
      title: 'Document',
    });
  });

  it('preserves _manifest_view_key from base config on save', () => {
    expect(
      layoutConfigToRecord(
        { regions: sample, mode: 'grid' },
        { _manifest_view_key: 'invoice_document', mode: 'stack', regions: [] }
      )
    ).toMatchObject({
      _manifest_view_key: 'invoice_document',
      mode: 'grid',
      regions: sample,
    });
  });
});
