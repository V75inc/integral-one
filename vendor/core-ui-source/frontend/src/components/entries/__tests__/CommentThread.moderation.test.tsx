/**
 * Who gets a delete control on a comment they did not write.
 *
 * The backend now lets a track admin/owner delete another person's comment
 * (`comment.moderate`), which exists because public-share comments carry
 * `author_id="public"` and so have no author who could ever remove them.
 *
 * That fix is unreachable unless the UI offers the control: the row used to
 * render edit+delete only when `isSamePrincipal(user, c.author_id)`, so a
 * visitor's comment showed no affordance at all to anyone.
 *
 * The split matters and is asserted in both directions — a moderator gets
 * **delete only**. Editing stays author-only because `update_comment` still
 * refuses it, and rendering an edit button that always 403s would be worse
 * than rendering none.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';

import { CommentThread } from '../CommentThread';
import type { Comment, User } from '../../../types';

afterEach(cleanup);

const ME: User = {
  id: 'n.User.me',
  display_name: 'Me',
} as User;

const ENTRY_ID = 'n.Entry.host';

/** A public visitor's comment: exactly what the public endpoint persists. */
const PUBLIC_COMMENT: Comment = {
  id: 'n.Comment.public',
  text: 'posted by an anonymous visitor',
  // What the public-share endpoint persists — no real principal.
  author_id: 'public',
  entry_id: ENTRY_ID,
  created_at: '2026-08-12T00:00:00Z',
};

/** A signed-in member's comment — someone who is not the caller. */
const MEMBER_COMMENT: Comment = {
  id: 'n.Comment.member',
  text: 'posted by another member',
  author_id: 'n.User.other',
  entry_id: ENTRY_ID,
  created_at: '2026-08-12T00:00:00Z',
};

const MY_COMMENT: Comment = {
  id: 'n.Comment.mine',
  text: 'posted by me',
  author_id: 'n.User.me',
  entry_id: ENTRY_ID,
  created_at: '2026-08-12T00:00:00Z',
};

function renderThread(comments: Comment[], canModerate: boolean) {
  return render(
    <CommentThread
      comments={comments}
      user={ME}
      canModerate={canModerate}
      replyingToId={null}
      replyText=""
      onReplyTextChange={() => {}}
      onStartReply={() => {}}
      onCancelReply={() => {}}
      onSubmitReply={() => {}}
      submittingReply={false}
      editingId={null}
      editText=""
      setEditingId={() => {}}
      setEditText={() => {}}
      onSaveEdit={() => {}}
      onDelete={vi.fn()}
    />
  );
}

describe('CommentThread moderation affordance', () => {
  it('offers no delete on a visitor comment to a non-moderator', () => {
    // The reported state: the comment is there and nobody can remove it.
    renderThread([PUBLIC_COMMENT], false);
    expect(screen.queryByLabelText(/delete|remove/i)).toBeNull();
  });

  it('offers delete on a visitor comment to a moderator', () => {
    renderThread([PUBLIC_COMMENT], true);
    expect(
      screen.getByLabelText("Remove this public visitor's comment"),
    ).toBeTruthy();
  });

  it('does not offer edit on someone else’s comment, even to a moderator', () => {
    // `update_comment` is still author-only. A visible edit button here would
    // be a control that always fails.
    renderThread([PUBLIC_COMMENT], true);
    expect(screen.queryByLabelText('Edit comment')).toBeNull();
  });

  it('still gives the author both controls on their own comment', () => {
    renderThread([MY_COMMENT], false);
    expect(screen.getByLabelText('Edit comment')).toBeTruthy();
    expect(screen.getByLabelText('Delete comment')).toBeTruthy();
  });

  it('labels each delete for whose comment it removes', () => {
    // Removing your own comment, a colleague's, and an anonymous visitor's
    // are three different acts; the accessible name is the only thing
    // distinguishing otherwise-identical trash icons. The visitor case used
    // to borrow the member wording, calling somebody with no workspace
    // membership a member.
    renderThread([MY_COMMENT, MEMBER_COMMENT, PUBLIC_COMMENT], true);
    expect(screen.getByLabelText('Delete comment')).toBeTruthy();
    expect(screen.getByLabelText("Remove this member's comment")).toBeTruthy();
    expect(
      screen.getByLabelText("Remove this public visitor's comment"),
    ).toBeTruthy();
  });
});
