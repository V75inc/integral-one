/**
 * Public-share permissions must compose, not mask each other.
 *
 * The bug this pins: `SharedTrackPage` chose the row-click target with an
 * if/else, so granting "Edit & Update Entries" made the comments branch
 * unreachable — ticking every permission box removed commenting from the
 * public view entirely. Found by driving the live public link.
 *
 * The exhaustive case below is the one that matters: it sweeps all 32
 * combinations of the five grants and asserts that `read_comments` alone
 * decides reachability. A hand-picked example set would have missed the
 * original bug, because the broken combination is precisely the one nobody
 * writes a test for — everything on.
 */
import { describe, it, expect } from 'vitest';

import {
  publicEntryAffordances,
  type PublicPermissions,
} from '../publicTrackAffordances';

const FLAGS: (keyof PublicPermissions)[] = [
  'read_entries',
  'read_comments',
  'create_comments',
  'create_entries',
  'update_entries',
];

/** All 32 combinations of the five permission flags. */
function everyPermutation(): PublicPermissions[] {
  const out: PublicPermissions[] = [];
  for (let mask = 0; mask < 1 << FLAGS.length; mask++) {
    const p: PublicPermissions = {};
    FLAGS.forEach((f, i) => {
      p[f] = Boolean(mask & (1 << i));
    });
    out.push(p);
  }
  return out;
}

describe('publicEntryAffordances', () => {
  it('never lets another permission suppress comment access', () => {
    const permutations = everyPermutation();
    // Guard the guard: an empty or mis-built sweep would make every
    // assertion below vacuous.
    expect(permutations).toHaveLength(32);

    for (const perms of permutations) {
      const a = publicEntryAffordances(perms);
      expect(a.commentsReachable).toBe(!!perms.read_comments);
    }
  });

  it('never lets a new grant remove a capability', () => {
    // The generalised form of the original bug. Adding a permission may only
    // add reach; for every combination, turning on one more flag must not
    // take away the row click or comment access.
    const permutations = everyPermutation();
    let comparisons = 0;
    for (const perms of permutations) {
      const before = publicEntryAffordances(perms);
      for (const flag of FLAGS) {
        if (perms[flag]) continue;
        const after = publicEntryAffordances({ ...perms, [flag]: true });
        comparisons++;
        if (before.rowAction === 'open') expect(after.rowAction).toBe('open');
        if (before.commentsReachable) expect(after.commentsReachable).toBe(true);
      }
    }
    // Guard the guard: zero comparisons would pass silently.
    expect(comparisons).toBe(80);
  });

  it('keeps comments reachable with every permission granted', () => {
    // The exact configuration from the report: all boxes ticked, and the
    // comment thread had disappeared.
    const all: PublicPermissions = {
      read_entries: true,
      read_comments: true,
      create_comments: true,
      create_entries: true,
      update_entries: true,
    };
    const a = publicEntryAffordances(all);

    expect(a.rowAction).toBe('open');
    expect(a.commentsReachable).toBe(true);
    expect(a.canEditEntries).toBe(true);
  });

  it('opens the record whether or not editing is granted', () => {
    // Edit rights change what the dialog offers, never whether it opens —
    // so there is no longer a permission combination in which the row click
    // means something different.
    const viewer = publicEntryAffordances({ read_entries: true, read_comments: true });
    const editor = publicEntryAffordances({
      read_entries: true,
      read_comments: true,
      update_entries: true,
    });
    expect(viewer.rowAction).toBe('open');
    expect(editor.rowAction).toBe('open');
    expect(viewer.canEditEntries).toBe(false);
    expect(editor.canEditEntries).toBe(true);
  });

  it('opens a read-only link instead of doing nothing', () => {
    // Previously a link granting only `read_entries` reported no row action,
    // so clicking a row on a plain read-only share was a silent no-op — the
    // record could be listed but never opened.
    const a = publicEntryAffordances({ read_entries: true });
    expect(a.rowAction).toBe('open');
    expect(a.commentsReachable).toBe(false);
    expect(a.canEditEntries).toBe(false);
  });

  it('treats missing permissions as no access', () => {
    for (const empty of [null, undefined, {}]) {
      const a = publicEntryAffordances(empty as PublicPermissions | null);
      expect(a.rowAction).toBe('none');
      expect(a.commentsReachable).toBe(false);
    }
  });
});
