import { describe, expect, it } from 'vitest';
import source from '../EntryDetail.tsx?raw';

/**
 * Read-only detail must resolve the entry type the same way the edit form does.
 *
 * Regression: EntryDetail matched the type by display name only, so a prefixed
 * key whose name differs (e.g. `crm_request` vs "Request") resolved to null —
 * the popup body rendered zero fields while Edit worked, because
 * EntryFormExpanded already used findEntryTypeBySlug.
 *
 * Asserted against the source (like ModalDockClearance) because rendering
 * EntryDetail needs auth, query and toast providers.
 */
describe('EntryDetail type resolution', () => {
  it('uses the shared key → name → id matcher', () => {
    expect(source).toMatch(/findEntryTypeBySlug\(typeList,\s*entry\.type\)/);
  });

  it('does not fall back to name-only matching', () => {
    expect(source).not.toMatch(
      /slug\(String\(x\.name \|\| ''\)\)\s*===\s*slug\(entry\.type/,
    );
  });

  it('keeps the read-only body static — no inline commit', () => {
    expect(source).not.toMatch(/onCommitField=\{canEdit \? commitCustomField/);
  });
});
