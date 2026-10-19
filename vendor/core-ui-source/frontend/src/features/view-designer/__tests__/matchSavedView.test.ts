import { describe, expect, it } from 'vitest';
import {
  matchSavedViewByKey,
  resolveDesignerTargetView,
  viewMissingManifestKey,
} from '../matchSavedView';
import type { SavedView } from '../../../types';

function view( partial: Partial<SavedView> & { id: string; name: string }): SavedView {
  return {
    type: 'layout_container',
    track_id: 't1',
    config: {},
    ...partial,
  } as SavedView;
}

describe('matchSavedView', () => {
  it('matches by _manifest_view_key', () => {
    const views = [
      view({
        id: '1',
        name: 'Invoice document',
        config: { _manifest_view_key: 'invoice_document' },
      }),
    ];
    expect(matchSavedViewByKey(views, 'invoice_document')?.id).toBe('1');
  });

  it('matches by slugified display name when key was wiped', () => {
    const views = [
      view({
        id: '1',
        name: 'Invoice document',
        config: { mode: 'grid', regions: [] },
      }),
    ];
    expect(matchSavedViewByKey(views, 'invoice_document')?.id).toBe('1');
  });

  it('falls back to a single layout_container on the track', () => {
    const views = [
      view({ id: 'feed', name: 'Feed', type: 'feed' }),
      view({ id: 'doc', name: 'Invoice document', type: 'layout_container', hidden: true }),
    ];
    expect(resolveDesignerTargetView(views, null)?.id).toBe('doc');
  });

  it('detects missing manifest key', () => {
    expect(
      viewMissingManifestKey(
        view({ id: '1', name: 'X', config: { mode: 'grid' } })
      )
    ).toBe(true);
    expect(
      viewMissingManifestKey(
        view({
          id: '1',
          name: 'X',
          config: { _manifest_view_key: 'invoice_document' },
        })
      )
    ).toBe(false);
  });
});
