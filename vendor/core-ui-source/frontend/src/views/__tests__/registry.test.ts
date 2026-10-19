import { describe, expect, it } from 'vitest';

import '../index';
import { getEnabledWidgetTypes, getWidget, listWidgets } from '../registry';
import contracts from '../contracts.json';
import { DASHBOARD_ONLY_VIEW_TYPES } from '../dashboardOnly';

const TRACK_MANIFEST_TYPES = new Set(listWidgets().map(reg => reg.type));

describe('frontend view library registry', () => {
  it('always enables feed even when no saved views exist', () => {
    const enabled = getEnabledWidgetTypes([]);
    expect(enabled.has('feed')).toBe(true);
  });

  it('resolves feed registration from the migrated frontend view library', () => {
    expect(getWidget('feed')).toBeDefined();
  });

  it('resolves Wiki view registration from the Core view library', () => {
    const reg = getWidget('wiki');
    expect(reg).toBeDefined();
    expect(reg?.meta.label).toBe('Wiki');
  });

  it('requires every contract type to have a track manifest or be dashboard-only', () => {
    for (const contract of contracts) {
      const type = contract.type;
      const hasManifest = TRACK_MANIFEST_TYPES.has(type);
      const dashboardOnly =
        contract.palette_group === 'dashboard' || DASHBOARD_ONLY_VIEW_TYPES.has(type);
      expect(
        hasManifest || dashboardOnly,
        `contract type "${type}" must have manifests/${type}.manifest.ts or palette_group/dashboardOnly flag`,
      ).toBe(true);
      if (dashboardOnly) {
        expect(DASHBOARD_ONLY_VIEW_TYPES.has(type)).toBe(true);
      }
    }
  });
});
