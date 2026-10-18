/**
 * The entry dialog's companion panel — comments, attachments, activity.
 *
 * PR #87 moved those three out of the dialog body into a column beside it.
 * The column is desktop-only (`Modal` drops `sidePanel` below `sm`, because
 * the dialog is full-bleed there), and nothing re-hosted the content on
 * mobile — so on a phone comments, attachments, activity AND the comment
 * composer were unreachable, while the body still showed a comment count
 * whose click scrolled to an unmounted anchor.
 *
 * These cover the reachability contract and the tab behaviour. Rendering the
 * whole of `EntryDetail` needs auth + query + toast + confirm providers and a
 * live entry, so the EntryDetail-specific guarantees are asserted against its
 * source — the same approach `ModalDockClearance.test.tsx` already takes for
 * this component, and the pairing IS the contract: lose the body host and the
 * mobile hole silently reopens with nothing else failing.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
// @ts-expect-error Node built-ins are available at vitest runtime; the project
// doesn't ship @types/node so the typed import is unavailable.
import * as fs from 'node:fs';
// @ts-expect-error see comment above
import * as path from 'node:path';

import { ViewTabs } from '../../ui/ViewTabs';
import { EmptyState } from '../../ui/EmptyState';
import { Modal } from '../../ui/Modal';

declare const process: { cwd(): string };

const ENTRY_DETAIL = path.resolve(
  process.cwd(),
  'src/components/entries/EntryDetail.tsx',
);
const source = () => fs.readFileSync(ENTRY_DETAIL, 'utf-8');

afterEach(cleanup);

describe('companion panel reachability', () => {
  it('renders the panel in the dialog body when there is no side column', () => {
    // The fix. `showSideColumn` picks a host; the body branch is what makes
    // the content exist at all on a phone.
    expect(source()).toMatch(/!showSideColumn && variant !== 'page' && \(/);
  });

  it('keeps exactly one definition of the panel content', () => {
    // Two hosts, one node. Rendering `panelNode` in both places would
    // duplicate the composer and the thread — and on a phone you would be
    // typing into whichever copy the browser focused.
    const matches = source().match(/const panelNode = \(/g) ?? [];
    expect(matches).toHaveLength(1);
  });

  it('chooses a host rather than rendering both', () => {
    const s = source();
    expect(s).toMatch(/sidePanel=\{commentsPanelOpen && \(variant === 'page' \|\| showSideColumn\)/);
    expect(s).toMatch(/\? panelNode : undefined\}/);
  });

  it('defaults pages to a closed panel and offers full-page navigation for saved dialogs', () => {
    expect(source()).toContain("settings.appearance.entryDetailsPanelOpen ?? (variant !== 'page')");
    expect(source()).toContain("variant !== 'page' && !isEditing");
    expect(source()).toContain('navigateToEntryPage(entryPagePath(entry.id))');
    expect(source()).toContain('pagePanelTriggerRef.current?.focus()');
  });

  it('drops the duplicate comment button from the body', () => {
    // `EntrySocialActions` kept a comment count + button in the body. With
    // the thread owned by a tab, that button was both a second control for
    // one thing and — because it scrolled a ref that is null when the panel
    // is closed — a silent no-op.
    expect(source()).toMatch(/hideComments/);
  });

  it('opens the panel and selects the tab instead of scrolling a dead ref', () => {
    const s = source();
    expect(s).toMatch(/const openComments = \(\) => \{/);
    // The guarantee: both state setters run, so the target always exists.
    const body = s.slice(s.indexOf('const openComments'), s.indexOf('const openComments') + 600);
    expect(body).toMatch(/setCommentsPanelOpen\(true\)/);
    expect(body).toMatch(/setPanelTab\('comments'\)/);
    // The old implementation, which is what made the click a no-op.
    expect(s).not.toMatch(/const scrollToComments/);
  });

  it('no longer hides activity behind a second disclosure', () => {
    // Selecting the tab IS the request to see it.
    expect(source()).not.toMatch(/setActivityOpen/);
  });
});

describe('Modal sidePanel', () => {
  it('renders the column inside the dialog, not as a second dialog', () => {
    render(
      <Modal open onClose={() => {}} title="Entry" sidePanel={<p>panel body</p>}>
        <p>record fields</p>
      </Modal>,
    );
    const dialog = screen.getByRole('dialog');
    const column = dialog.querySelector('[data-modal-side-panel]');
    expect(column).not.toBeNull();
    // One card on screen — the earlier design raised a second surface beside
    // the dialog, which read as two dialogs competing.
    expect(screen.getAllByRole('dialog')).toHaveLength(1);
    expect(dialog.contains(column)).toBe(true);
  });

  it('gives a dialog with a companion column a floor near the window height', () => {
    // With the 90vh cap this settles into a consistent 80–90vh band, so a
    // record surface stops resizing itself around however much content it
    // happens to hold.
    render(
      <Modal open onClose={() => {}} title="Entry" sidePanel={<p>panel</p>}>
        <p>record fields</p>
      </Modal>,
    );
    const cls = screen.getByRole('dialog').className;
    expect(cls).toContain('sm:min-h-[calc(80dvh-var(--system-bar-h,0px))]');
    expect(cls).toContain('sm:max-h-[calc(90dvh-var(--system-bar-h,0px))]');
    // The floor also has to override the mobile `min-h-[100dvh]`, so it
    // replaces `sm:min-h-0` rather than sitting beside it — two min-height
    // utilities at one breakpoint collide.
    expect(cls).not.toContain('sm:min-h-0');
  });

  it('keeps the floor when the panel is hidden or stacked', () => {
    // The regression this guards: EntryDetail passes `sidePanel={undefined}`
    // both when the user hides the panel and when it stacks into the body on
    // a narrow container. Keying the floor on `sidePanel` meant the dialog
    // snapped back to content height in exactly those cases.
    render(
      <Modal open onClose={() => {}} title="Entry" hasCompanionPanel>
        <p>record fields</p>
      </Modal>,
    );
    const cls = screen.getByRole('dialog').className;
    expect(cls).toContain('sm:min-h-[calc(80dvh-var(--system-bar-h,0px))]');
    expect(cls).not.toContain('sm:min-h-0');
  });

  it('lets a caller opt a companion dialog out of the floor', () => {
    render(
      <Modal open onClose={() => {}} title="Entry" sidePanel={<p>p</p>} hasCompanionPanel={false}>
        <p>record fields</p>
      </Modal>,
    );
    expect(screen.getByRole('dialog').className).toContain('sm:min-h-0');
  });

  it('leaves dialogs without a column to their content', () => {
    // A floor on every standard dialog stranded sparse control surfaces:
    // Public Share Settings measured 61px of content inside a 788px shell.
    const { unmount } = render(
      <Modal open onClose={() => {}} title="Share settings">
        <p>a short form</p>
      </Modal>,
    );
    const plain = screen.getByRole('dialog').className;
    expect(plain).not.toContain('min-h-[calc(80dvh-var(--system-bar-h,0px))]');
    expect(plain).toContain('sm:min-h-0');
    unmount();

    render(
      <Modal open onClose={() => {}} title="Delete entry" variant="compact">
        <p>Are you sure?</p>
      </Modal>,
    );
    expect(screen.getByRole('dialog').className).not.toContain('min-h-[calc(80dvh-var(--system-bar-h,0px))]');
  });

  it('widens the dialog only when the column is present', () => {
    const { unmount } = render(
      <Modal open onClose={() => {}} title="Entry">
        <p>record fields</p>
      </Modal>,
    );
    expect(screen.getByRole('dialog').className).toContain('max-w-dialog-form');
    unmount();

    render(
      <Modal open onClose={() => {}} title="Entry" sidePanel={<p>panel</p>}>
        <p>record fields</p>
      </Modal>,
    );
    expect(screen.getByRole('dialog').className).toContain('max-w-dialog-wide');
  });
});

describe('ViewTabs keyboard contract', () => {
  const OPTIONS = [
    { value: 'comments', label: 'Comments', count: 0 },
    { value: 'attachments', label: 'Attachments', count: 2 },
    { value: 'activity', label: 'Activity' },
  ];

  function Harness({ onChange }: { onChange: (v: string) => void }) {
    return (
      <ViewTabs
        options={OPTIONS}
        value="comments"
        onChange={onChange}
        ariaLabel="Entry details"
        size="sm"
      />
    );
  }

  it('exposes one tab stop, not one per tab', () => {
    render(<Harness onChange={() => {}} />);
    const tabs = screen.getAllByRole('tab');
    expect(tabs.filter(t => t.tabIndex === 0)).toHaveLength(1);
    expect(tabs.filter(t => t.tabIndex === -1)).toHaveLength(2);
  });

  it('moves selection with ArrowRight / ArrowLeft', () => {
    const seen: string[] = [];
    render(<Harness onChange={v => seen.push(v)} />);
    const strip = screen.getByRole('tablist');
    fireEvent.keyDown(strip, { key: 'ArrowRight' });
    expect(seen).toEqual(['attachments']);
    fireEvent.keyDown(strip, { key: 'ArrowLeft' });
    // Wraps from the first option to the last.
    expect(seen).toEqual(['attachments', 'activity']);
  });

  it('jumps to first and last with Home / End', () => {
    const seen: string[] = [];
    render(<Harness onChange={v => seen.push(v)} />);
    const strip = screen.getByRole('tablist');
    fireEvent.keyDown(strip, { key: 'End' });
    expect(seen).toEqual(['activity']);
  });

  it('ignores keys it does not own', () => {
    const seen: string[] = [];
    render(<Harness onChange={v => seen.push(v)} />);
    fireEvent.keyDown(screen.getByRole('tablist'), { key: 'a' });
    expect(seen).toEqual([]);
  });

  it('renders counts including zero, so an empty tab still says so', () => {
    render(<Harness onChange={() => {}} />);
    expect(screen.getByRole('tab', { name: /Comments/ }).textContent).toContain('0');
    expect(screen.getByRole('tab', { name: /Attachments/ }).textContent).toContain('2');
  });
});

describe('EmptyState dense', () => {
  it('trims padding for a narrow column', () => {
    const { container, unmount } = render(
      <EmptyState size="dense" title="No comments yet" description="Start the discussion." />,
    );
    expect(container.firstElementChild?.className).toContain('py-8');
    unmount();

    const { container: wide } = render(<EmptyState title="No comments yet" />);
    expect(wide.firstElementChild?.className).toContain('py-16');
  });
});

describe('entry edit header control', () => {
  it('keeps a cancel toggle in the edit position while retaining form cancellation', () => {
    const source = fs.readFileSync(ENTRY_DETAIL, 'utf8');
    expect(source).toContain("aria-label={isEditing ? 'Cancel edit' : 'Edit entry'}");
    expect(source).toContain('onClick={() => setIsEditing(editing => !editing)}');
    expect(source).toContain('onCancel={() => setIsEditing(false)}');
  });
});
