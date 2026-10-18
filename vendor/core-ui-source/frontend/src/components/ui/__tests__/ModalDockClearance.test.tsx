/**
 * Modals must not cover the assistant dock — August 5 QA item 6,
 * "Quick Access Chat No Longer Supports Conversation with Selected Entries".
 *
 * Opening an entry rendered a `fixed inset-0` scrim across the whole viewport,
 * including the dock column. The composer stayed visible but every click
 * landed on the scrim, so the assistant was unreachable at exactly the moment
 * `EntryDetail` publishes that entry as the agent's dialog context.
 *
 * The container stops at `--assistant-dock-w` when the dialog asks for it,
 * which `AssistantDockContext` already publishes (and pins to 0 whenever the
 * dock isn't squeezing: closed, mobile, `/agent`).
 *
 * Opt-in, deliberately. `aria-modal="true"` promises the rest of the page is
 * inert, so a live surface beside a dialog is a claim a modal should only make
 * on purpose — a confirm prompt keeps the full scrim. `EntryDetail` opts in
 * because it publishes its entry as the agent's context on open.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
// @ts-expect-error Node built-ins are available at vitest runtime; the project
// doesn't ship @types/node so the typed import is unavailable.
import * as fs from 'node:fs';
// @ts-expect-error see comment above
import * as path from 'node:path';

declare const process: { cwd(): string };

import { Modal } from '../Modal';

afterEach(() => {
  cleanup();
  document.documentElement.style.removeProperty('--assistant-dock-w');
});

/** The scrim's parent — the element that owns the covered region. */
function overlayContainer(): HTMLElement {
  const dialog = screen.getByRole('dialog');
  const container = dialog.parentElement;
  if (!container) throw new Error('modal container not found');
  return container;
}

describe('Modal dock clearance', () => {
  it('reserves the dock column when the dialog opts in', () => {
    render(
      <Modal open onClose={() => {}} title="Entry" allowAssistantDock>
        <p>body</p>
      </Modal>,
    );
    // Inline style, not a class: the width is a live CSS variable that the
    // dock updates as the user drags the resize handle.
    expect(overlayContainer().style.right).toBe('var(--assistant-dock-w, 0px)');
    expect(overlayContainer().style.top).toBe('var(--system-bar-h, 0px)');
  });

  it('covers the dock by default', () => {
    // The safe default: `aria-modal` means inert, so a dialog that has not
    // asked for a live companion surface does not get one.
    render(
      <Modal open onClose={() => {}} title="Confirm">
        <p>body</p>
      </Modal>,
    );
    expect(overlayContainer().style.right).toBe('');
    expect(overlayContainer().style.top).toBe('var(--system-bar-h, 0px)');
  });

  it('claims aria-modal only when the page really is inert', () => {
    // Default: modal in every sense. Opt-in: the dock is live and in the Tab
    // cycle, so claiming modality would tell a screen-reader user the surface
    // they can reach does not exist — the attribute is omitted.
    const plain = render(
      <Modal open onClose={() => {}} title="Confirm">
        <p>body</p>
      </Modal>,
    );
    expect(screen.getByRole('dialog').getAttribute('aria-modal')).toBe('true');
    plain.unmount();

    render(
      <Modal open onClose={() => {}} title="Entry" allowAssistantDock>
        <p>body</p>
      </Modal>,
    );
    expect(screen.getByRole('dialog').hasAttribute('aria-modal')).toBe(false);
  });

  it('the dock advertises itself to the focus trap', () => {
    // Source-level pairing, like the EntryDetail opt-in below: the trap finds
    // the dock via [data-assistant-dock], and losing the attribute silently
    // returns the clearance to mouse-only.
    const source = fs.readFileSync(
      path.resolve(process.cwd(), 'src/features/ai-chat/dock/AssistantDock.tsx'),
      'utf-8',
    );
    expect(source).toMatch(/data-assistant-dock/);
    const modal = fs.readFileSync(
      path.resolve(process.cwd(), 'src/components/ui/Modal.tsx'),
      'utf-8',
    );
    expect(modal).toMatch(/data-assistant-dock/);
  });

  it('EntryDetail opts in — it publishes the entry as agent context', () => {
    // Asserted against the source rather than by rendering EntryDetail, which
    // needs auth, query and toast providers. The pairing is the contract: if
    // the prop is dropped, the dock goes dead behind the entry dialog again
    // and nothing else fails.
    const source = fs.readFileSync(
      path.resolve(process.cwd(), 'src/components/entries/EntryDetail.tsx'),
      'utf-8',
    );
    expect(source).toMatch(/allowAssistantDock/);
  });

  it('still spans the viewport when the dock is not squeezing', () => {
    // The fallback in the var expression is what makes this safe everywhere the
    // dock is absent — a closed dock publishes 0px, an unmounted one publishes
    // nothing at all.
    document.documentElement.style.setProperty('--assistant-dock-w', '0px');
    render(
      <Modal open onClose={() => {}} title="Entry" allowAssistantDock>
        <p>body</p>
      </Modal>,
    );
    const container = overlayContainer();
    expect(container.className).toContain('inset-0');
    expect(
      getComputedStyle(document.documentElement).getPropertyValue(
        '--assistant-dock-w',
      ),
    ).toBe('0px');
  });

  it('keeps the scrim inside the container so it cannot escape the reservation', () => {
    render(
      <Modal open onClose={() => {}} title="Entry" allowAssistantDock>
        <p>body</p>
      </Modal>,
    );
    const container = overlayContainer();
    const scrim = container.querySelector('[aria-hidden]');
    expect(scrim).not.toBeNull();
    // `absolute inset-0` resolves against the container, so narrowing the
    // container is what narrows the scrim. A `fixed` scrim would ignore it.
    expect(scrim?.className).toContain('absolute');
    expect(scrim?.className).toContain('inset-0');
  });

  it('side panel widens a form dialog to dialog-wide', () => {
    render(
      <Modal
        open
        onClose={() => {}}
        title="Entry"
        sidePanel={<aside>panel</aside>}
      >
        <p>body</p>
      </Modal>,
    );
    expect(screen.getByRole('dialog').className).toContain('max-w-dialog-wide');
  });

  it('keeps workspace-max width when a side panel is open', () => {
    // Entry enlarge / View Designer pass workspace widths; the companion
    // column must not downgrade them back to dialog-wide.
    render(
      <Modal
        open
        onClose={() => {}}
        title="Entry"
        width="max-w-dialog-workspace-max"
        sidePanel={<aside>panel</aside>}
      >
        <p>body</p>
      </Modal>,
    );
    const cls = screen.getByRole('dialog').className;
    expect(cls).toContain('max-w-dialog-workspace-max');
    expect(cls).not.toContain('max-w-dialog-wide');
  });

  it('EntryDetail wires the overflow size action to appearance.entryDialogExpanded', () => {
    const source = fs.readFileSync(
      path.resolve(process.cwd(), 'src/components/entries/EntryDetail.tsx'),
      'utf-8',
    );
    expect(source).toMatch(/entryDialogExpanded/);
    expect(source).toContain("key: 'dialog-size'");
    expect(source).toMatch(/max-w-dialog-workspace-max/);
  });
});
