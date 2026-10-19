/**
 * Avatar consumer-surface lockfile — Phase 9 Plan 09-01 (AVT-02).
 *
 * Locks down the named consumer surfaces that wire the new
 * ``attachmentId`` prop on ``<Avatar />``. A future refactor that
 * silently drops one of these sites will trip this test.
 *
 * The list is intentionally hard-coded (not computed from globs) so
 * the surfaces are addressable in PR review — adding/removing a site
 * is a deliberate edit to this file, not a side-effect of refactoring
 * elsewhere.
 *
 * NOTE: the test reads files relative to the frontend project root
 * (``frontend/``) which is the working directory when vitest runs.
 */
import { describe, it, expect } from 'vitest';
// @ts-expect-error Node built-ins are available at vitest runtime; the
// project doesn't ship @types/node so the typed import is unavailable.
import * as fs from 'node:fs';
// @ts-expect-error see comment above
import * as path from 'node:path';

// process is available globally under Vitest's Node env.
declare const process: { cwd(): string };

const EXPECTED_CONSUMER_SURFACES = [
  'src/components/layout/Sidebar.tsx',          // 1
  'src/components/entries/EntryCard.tsx',       // 2
  'src/components/entries/EntryDetail.tsx',     // 3
  'src/components/ui/UserByline.tsx',           // 4
  'src/components/tracks/TrackCard.tsx',        // 5
  'src/components/collab/UserSearchPicker.tsx', // 6
  'src/pages/AppDetailPage.tsx',              // 7
  'src/features/settings/sections/ProfileSection.tsx', // 8 — canonical profile
  'src/pages/WorkspaceMembersPage.tsx',         // 9
  // 10 — was src/pages/TrackDetailPage.tsx until the Wave 4 split moved the
  // collaborator list (and its Avatar) out of the page. The surface is the
  // same one, at its new address; this edit is the deliberate re-point the
  // header above asks for, not a silent drop.
  'src/components/tracks/detail/TrackCollaboratorsModal.tsx',
];

describe('Avatar consumer surfaces (AVT-02 lockfile)', () => {
  it('lists at least 9 surfaces', () => {
    expect(EXPECTED_CONSUMER_SURFACES.length).toBeGreaterThanOrEqual(9);
  });

  for (const surface of EXPECTED_CONSUMER_SURFACES) {
    it(`${surface} mounts <Avatar /> with attachmentId=`, () => {
      const abs = path.resolve(process.cwd(), surface);
      const content = fs.readFileSync(abs, 'utf-8');
      // Match either ``<Avatar `` (single-line, props inline) OR
      // ``<Avatar\n`` (multi-line JSX, props on subsequent lines) OR
      // ``<AvatarUploadControl`` (the upload-aware wrapper that itself
      // renders <Avatar> internally — e.g. a profile
      // Facebook-style upload affordance).
      expect(content).toMatch(/<(Avatar|AvatarUploadControl)[\s\n]/);
      // Accept either JSX prop form (``attachmentId=``) or the
      // object-literal form (``attachmentId:``) used by callers that
      // pass an ``avatar`` slot to AvatarUploadControl.
      expect(content).toMatch(/attachmentId[=:]/);
    });
  }
});
