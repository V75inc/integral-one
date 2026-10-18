/**
 * What a public visitor can actually reach on a shared track.
 *
 * The row click is the only entry point a table view offers (`TableWidget`
 * exposes `onEntryOpen` and nothing else), so `SharedTrackPage` has to decide
 * what that single click means. It used to decide with a bare if/else:
 *
 *     if (perms.update_entries)      setEditingEntry(e)
 *     else if (perms.read_comments)  setCommentingEntry(e)
 *
 * which made the comment branch dead code the moment edit rights were granted.
 * Ticking every box in Public Share Settings — the natural thing to do when you
 * want an open, participatory link — silently removed commenting from the
 * public view. Granting *more* permission took a capability away. Reported
 * from the live app on 2026-08-12.
 *
 * That whole class of problem is now structural rather than guarded: the row
 * click opens the record, and every capability is a control *inside* that one
 * dialog — edit is a header toggle, discussion is a panel. Permissions add
 * controls; they can no longer replace each other. This matches the
 * authenticated entry dialog, which has always opened read-first.
 *
 * Kept as a pure function so the composition rule is testable without
 * mounting the page, which needs a router, a query client and a live token.
 */

export interface PublicPermissions {
  read_entries?: boolean;
  read_comments?: boolean;
  create_comments?: boolean;
  create_entries?: boolean;
  update_entries?: boolean;
}

export type PublicRowAction = 'open' | 'none';

export interface PublicEntryAffordances {
  /** What opens when the visitor clicks an entry row. */
  rowAction: PublicRowAction;
  /**
   * Whether the visitor can get to the comment thread at all, by any route.
   * This is the invariant that broke: it must track `read_comments` alone and
   * never be suppressed by another permission.
   */
  commentsReachable: boolean;
  /** Whether the dialog offers an edit mode. */
  canEditEntries: boolean;
}

export function publicEntryAffordances(
  perms: PublicPermissions | null | undefined,
): PublicEntryAffordances {
  const p = perms || {};
  const canReadEntries = !!p.read_entries;
  const canReadComments = !!p.read_comments;

  return {
    // A row the visitor can see is a row they can open. Edit rights change
    // what the dialog offers, never whether it opens.
    rowAction: canReadEntries || canReadComments ? 'open' : 'none',
    commentsReachable: canReadComments,
    canEditEntries: !!p.update_entries,
  };
}
