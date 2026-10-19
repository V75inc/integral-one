/**
 * One discussion widget across the login boundary.
 *
 * The public shared-track link had its own comment list, its own composer and
 * its own dialog shell. Rendered side by side with the authenticated entry
 * dialog they read as two different products: flat cards with a date-only
 * stamp vs an avatared threaded conversation; a filled "Send" button vs a
 * quiet glyph; "Edit Public Response" vs the record's own name; and a
 * hand-rolled `fixed inset-0` overlay with no `role="dialog"`, no focus trap
 * and no Escape-to-close (all measured on the live page before the change).
 *
 * The widgets are rendered for real. The page-level guarantees are asserted
 * against source, the same approach `EntryDetailPanel.test.tsx` takes for
 * EntryDetail — rendering SharedTrackPage needs a router, a live share token
 * and a toast provider, and the point being defended here is structural:
 * that the public surface reaches for the shared shell instead of growing
 * another copy.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
// @ts-expect-error Node built-ins are available at vitest runtime; the project
// doesn't ship @types/node so the typed import is unavailable.
import * as fs from 'node:fs';
// @ts-expect-error see comment above
import * as path from 'node:path';

import { CommentsPanel, COMMENT_FOOTER_CLASS } from '../comments/CommentsPanel';
import { CommentComposer } from '../comments/CommentComposer';
import type { Comment } from '../../../types';

declare const process: { cwd(): string };

const SHARED_TRACK_PAGE = path.resolve(process.cwd(), 'src/pages/SharedTrackPage.tsx');
const ENTRY_DETAIL = path.resolve(process.cwd(), 'src/components/entries/EntryDetail.tsx');
const COMMENTS_SECTION = path.resolve(
  process.cwd(),
  'src/components/entries/EntryCommentsSection.tsx',
);
const read = (p: string) => fs.readFileSync(p, 'utf-8');

afterEach(cleanup);

function comment(over: Partial<Comment> = {}): Comment {
  return {
    id: 'c1',
    text: 'Ship it.',
    author_id: 'n.User.1',
    created_at: new Date().toISOString(),
    ...over,
  } as Comment;
}

const composerProps = {
  value: '',
  onChange: () => {},
  onSubmit: () => {},
};

describe('CommentsPanel', () => {
  const base = {
    user: null,
    composerValue: '',
    onComposerChange: () => {},
    onSubmitComment: () => {},
  };

  it('shows the real empty state, not a line of italic text', () => {
    render(<CommentsPanel {...base} comments={[]} />);
    expect(screen.getByText('No comments yet')).toBeTruthy();
    expect(screen.getByText('Start the discussion about this entry.')).toBeTruthy();
  });

  it('words the empty state differently when the caller cannot post', () => {
    render(<CommentsPanel {...base} comments={[]} canComment={false} />);
    expect(screen.getByText('Nobody has commented on this entry.')).toBeTruthy();
  });

  it('renders a thread once there are comments', () => {
    render(<CommentsPanel {...base} comments={[comment()]} />);
    expect(screen.getByText('Ship it.')).toBeTruthy();
  });

  it('withholds reply from surfaces whose API has no parent_id', () => {
    // The public share endpoint creates flat comments only. `canReply` is
    // separate from `canComment` precisely so a visitor can join the
    // discussion without being offered a control that cannot work.
    const { container: withReply } = render(
      <CommentsPanel {...base} comments={[comment()]} canComment canReply />,
    );
    const replyCount = withReply.querySelectorAll('button').length;
    cleanup();

    const { container: noReply } = render(
      <CommentsPanel {...base} comments={[comment()]} canComment canReply={false} />,
    );
    expect(noReply.querySelectorAll('button').length).toBeLessThan(replyCount);
  });

  it('threads a reply instead of flattening it into the list', () => {
    // The public endpoint returns replies alongside top-level comments —
    // a reply carries an edge to the entry as well as to its parent — and
    // the bespoke public list rendered the lot flat, so a reply read as a
    // new remark. `parent_id` survives the public export (verified against
    // the live endpoint), so the shared thread nests it.
    render(
      <CommentsPanel
        {...base}
        comments={[
          comment({ id: 'c1', text: 'Parent remark' }),
          comment({ id: 'c2', text: 'A reply', parent_id: 'c1' } as Partial<Comment>),
        ]}
      />,
    );
    // Nesting renders as an indent plus a rule down the child row.
    const indentOf = (text: string) => {
      const row = screen.getByText(text).closest('[class*="border-l-2"]') as HTMLElement | null;
      return row?.style.marginLeft ?? null;
    };
    expect(indentOf('Parent remark')).toBeNull();
    expect(indentOf('A reply')).toMatch(/^\d+px$/);
  });

  it('names a public visitor in the moderation control too', () => {
    // The delete affordance said "Remove this member's comment" over an
    // anonymous visitor's remark — the same mislabel as the display name,
    // in the control that acts on it.
    render(
      <CommentsPanel
        {...base}
        comments={[comment({ author_id: 'public' })]}
        canModerate
      />,
    );
    expect(screen.getByLabelText("Remove this public visitor's comment")).toBeTruthy();
    expect(screen.queryByLabelText("Remove this member's comment")).toBeNull();
  });

  it('labels a public visitor as one, on every surface', () => {
    // Backend stamps `author_id="public"` with no author export. The generic
    // fallback rendered that as "Member" — presenting an anonymous link
    // commenter as somebody with workspace membership, in the SIGNED-IN
    // dialog as much as the public one.
    render(<CommentsPanel {...base} comments={[comment({ author_id: 'public' })]} />);
    expect(screen.getByText('Public visitor')).toBeTruthy();
    expect(screen.queryByText('Member')).toBeNull();
  });
});

describe('CommentComposer', () => {
  it('drops the mention picker where there is no directory to mention into', () => {
    const { container } = render(<CommentComposer {...composerProps} mentions={false} />);
    const field = container.querySelector('textarea');
    expect(field).not.toBeNull();
    expect(field?.getAttribute('placeholder')).toBe('Write a comment…');
    expect(field?.getAttribute('placeholder')).not.toContain('@');
  });

  it('sends on Enter and breaks the line on Shift+Enter', () => {
    const onSubmit = vi.fn();
    const { container } = render(
      <CommentComposer {...composerProps} value="hi" onSubmit={onSubmit} mentions={false} />,
    );
    const field = container.querySelector('textarea')!;
    fireEvent.keyDown(field, { key: 'Enter', shiftKey: true });
    expect(onSubmit).not.toHaveBeenCalled();
    fireEvent.keyDown(field, { key: 'Enter' });
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it('refuses to send whitespace', () => {
    const onSubmit = vi.fn();
    const { container } = render(
      <CommentComposer {...composerProps} value="   " onSubmit={onSubmit} mentions={false} />,
    );
    const send = screen.getByLabelText('Send comment') as HTMLButtonElement;
    expect(send.disabled).toBe(true);
    fireEvent.keyDown(container.querySelector('textarea')!, { key: 'Enter' });
    expect(onSubmit).not.toHaveBeenCalled();
  });
});

describe('every comment surface uses the shared widgets', () => {
  it('has exactly one composer implementation', () => {
    // Three copies of this chrome existed. The tell is the mention-enabled
    // textarea wired straight to a send button; if it reappears outside
    // CommentComposer, the copies are back.
    for (const [name, file] of [
      ['SharedTrackPage', SHARED_TRACK_PAGE],
      ['EntryDetail', ENTRY_DETAIL],
      ['EntryCommentsSection', COMMENTS_SECTION],
    ] as const) {
      const src = read(file);
      expect(src, `${name} should render CommentComposer`).toMatch(/<CommentComposer/);
      expect(src, `${name} should not hand-roll a composer`).not.toMatch(
        /<MentionableTextarea/,
      );
    }
  });

  it('shares the footer chrome rather than re-deriving the padding', () => {
    expect(COMMENT_FOOTER_CLASS).toContain('border-t');
    expect(read(SHARED_TRACK_PAGE)).toMatch(/COMMENT_FOOTER_CLASS/);
    expect(read(ENTRY_DETAIL)).toMatch(/COMMENT_FOOTER_CLASS/);
  });

  it('renders the public thread through CommentsPanel', () => {
    const src = read(SHARED_TRACK_PAGE);
    expect(src).toMatch(/<CommentsPanel/);
    // The bespoke list this replaced, and its italic empty line.
    expect(src).not.toMatch(/No comments yet\. Write the first one below!/);
    expect(src).not.toMatch(/Public User/);
  });
});

describe('the public entry dialog uses the shared Modal shell', () => {
  const src = () => read(SHARED_TRACK_PAGE);

  it('is a real dialog, not a hand-rolled overlay', () => {
    // Measured on the live page beforehand: 0 elements with role="dialog",
    // no aria-modal, body scroll unlocked, Escape did nothing.
    expect(src()).toMatch(/<Modal/);
    expect(src()).not.toMatch(/fixed inset-0 z-overlay flex justify-end/);
  });

  it('titles itself with the record, like the authenticated dialog', () => {
    expect(src()).toMatch(/title=\{openEntry\.title \|\| 'Entry'\}/);
  });

  it('closes with the shell button rather than a literal glyph', () => {
    expect(src()).not.toMatch(/✕/);
  });

  it('renders the record body as a document, not as markdown source', () => {
    // The public read view used plain pre-wrapped text, so a reader saw
    // "## What this App does" and "- **Ideas**" verbatim while the
    // authenticated dialog rendered the same body formatted.
    const s = src();
    expect(s).toMatch(/<MarkdownContent>\{openEntry\.body\}<\/MarkdownContent>/);
    expect(s).not.toMatch(/whitespace-pre-wrap[^\n]*\n\s*\{openEntry\.body\}/);
  });

  it('opens read-first, with edit as a mode of the same dialog', () => {
    // The public link used to open straight into a form, so a visitor with
    // edit rights could not simply look at a record, and one without them
    // could not see its fields at all.
    const s = src();
    expect(s).toMatch(/\{!editMode \? \(/);
    expect(s).toMatch(/<EntryMetaFields/);
    expect(s).toMatch(/label="Edit entry"/);
  });

  it('cannot strand a discussion outside its record', () => {
    // Previously the thread had its own entry state, so closing the form
    // left a comments dialog behind that opened itself. There is now one
    // open record, and the panel derives from it.
    const s = src();
    expect(s).not.toMatch(/commentingEntry/);
    expect(s).toMatch(/const publicCommentsPanel = openEntry && perms\.read_comments/);
    // One dialog per surface: create, and the record. No standalone thread.
    expect(s.match(/<Modal/g) ?? []).toHaveLength(2);
  });

  it('keeps the panel toggle to viewports that have a panel to toggle', () => {
    // Below `sm` the shell drops its side column and the thread renders in
    // the body; a toggle there would hide content with no way back.
    expect(src()).toMatch(/showSideColumn && publicCommentsPanel && \(/);
  });
});
