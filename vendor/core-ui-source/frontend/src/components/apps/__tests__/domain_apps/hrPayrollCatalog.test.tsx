/**
 * Phase 17 — HR + Payroll App frontend smoke test.
 *
 * Phase 17 introduces no new frontend components. The install catalog,
 * config panels, entry composer, and kanban view all consume the new
 * manifests through the same code paths that ship the existing CRM + PM
 * Suite App. The only new field type — `member` — was wired by ACC-08
 * and has its own widget test under
 * `src/components/entries/fieldTypes/__tests__/MemberField.test.tsx`.
 *
 * This smoke test pins two things:
 *
 * 1. The `member` field-type registration survives at module load (the
 * Phase 17 manifests use `type: member` for `Employee.member`; if a
 * future change unregistered the widget the entry form would render
 * `MissingFieldType` instead of `UserSearchPicker`).
 *
 * 2. The kanban view registration covers the `time_off_board` shape
 * Phase 17 uses for the Time-Off Requests track. The kanban widget
 * is an existing palette `view_type`; this is a regression guard, not
 * a new component.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { getFieldType } from '../../../entries/fieldTypes/registry';
import { memberFieldRegistration } from '../../../entries/fieldTypes';
import { getWidget, listWidgets } from '../../../../views/registry';
import { registerDiscoveredWidgets } from '../../../../views/manifests/auto';

beforeAll(() => {
  // Auto-discovery is normally triggered at app boot via main.tsx —
  // explicitly trigger here so the registry is populated for this test.
  registerDiscoveredWidgets();
});

describe('Phase 17 — HR + Payroll frontend wiring smoke', () => {
  it('exposes the `member` field-type registration the HR Employee form depends on', () => {
    const reg = getFieldType('member');
    expect(reg).toBeDefined();
    expect(reg).toBe(memberFieldRegistration);
    expect(reg?.meta.label).toBe('Member');
  });

  it('kanban widget is registered for the time_off_board layout', () => {
    const kanban = getWidget('kanban');
    expect(kanban).toBeDefined();
    const keys = listWidgets().map(v => v.type);
    // Smoke: the palette covers the view_types Phase 17 manifests reference
    // (table, kanban, calendar, gallery). Phase 17 introduces no new view
    // types — all are existing palette entries.
    for (const required of ['kanban', 'table', 'calendar', 'gallery']) {
      expect(keys).toContain(required);
    }
  });
});
