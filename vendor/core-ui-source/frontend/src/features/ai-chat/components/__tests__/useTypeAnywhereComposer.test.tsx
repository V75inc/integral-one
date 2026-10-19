/**
 * Type-anywhere composer routing — August 5 QA item 4.
 *
 * "The chat bar should be automatically active … any text entered while on
 * the chat interface should automatically be directed to the chat bar."
 *
 * The composer already autoFocuses on mount; what was missing is every moment
 * after — click a message, dismiss a popover, and the next keystroke went
 * nowhere. These cover the decision (which keys get claimed) and the delivery
 * (the character must reach React, not just the DOM node).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { useRef, useState } from 'react';

import {
  CHAT_SURFACE_ATTR,
  appendCharToComposer,
  shouldRedirectKeyToComposer,
  useTypeAnywhereComposer,
} from '../useTypeAnywhereComposer';

function mountSurface() {
  const root = document.createElement('div');
  root.setAttribute(CHAT_SURFACE_ATTR, '');
  const composer = document.createElement('textarea');
  composer.setAttribute('aria-label', 'Message input');
  root.appendChild(composer);
  document.body.appendChild(root);
  return { root, composer };
}

function key(init: KeyboardEventInit & { key: string }) {
  return new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init });
}

describe('shouldRedirectKeyToComposer', () => {
  let root: HTMLElement;
  let composer: HTMLTextAreaElement;

  beforeEach(() => {
    ({ root, composer } = mountSurface() as {
      root: HTMLElement;
      composer: HTMLTextAreaElement;
    });
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('claims a plain printable character', () => {
    expect(shouldRedirectKeyToComposer(key({ key: 'h' }), composer, root)).toBe(true);
  });

  it.each([
    ['meta', { key: 'k', metaKey: true }],
    ['ctrl', { key: 'c', ctrlKey: true }],
    ['alt', { key: 'a', altKey: true }],
  ])('leaves %s shortcuts alone', (_label, init) => {
    expect(
      shouldRedirectKeyToComposer(key(init as KeyboardEventInit & { key: string }), composer, root),
    ).toBe(false);
  });

  it.each(['Tab', 'Escape', 'Enter', 'ArrowDown', 'F5'])(
    'ignores the navigation key %s',
    (k) => {
      expect(shouldRedirectKeyToComposer(key({ key: k }), composer, root)).toBe(false);
    },
  );

  it('ignores keystrokes already going to an input', () => {
    const input = document.createElement('input');
    document.body.appendChild(input);
    const event = key({ key: 'h' });
    Object.defineProperty(event, 'target', { value: input });
    expect(shouldRedirectKeyToComposer(event, composer, root)).toBe(false);
  });

  it('ignores keystrokes in a contenteditable', () => {
    const editable = document.createElement('div');
    editable.contentEditable = 'true';
    // jsdom does not implement isContentEditable from the attribute.
    Object.defineProperty(editable, 'isContentEditable', { value: true });
    const event = key({ key: 'h' });
    Object.defineProperty(event, 'target', { value: editable });
    expect(shouldRedirectKeyToComposer(event, composer, root)).toBe(false);
  });

  it('does nothing when the composer already has focus', () => {
    composer.focus();
    expect(shouldRedirectKeyToComposer(key({ key: 'h' }), composer, root)).toBe(false);
  });

  it('does not steal from a disabled composer', () => {
    composer.disabled = true;
    expect(shouldRedirectKeyToComposer(key({ key: 'h' }), composer, root)).toBe(false);
  });

  it.each([
    ['a button', () => document.createElement('button')],
    [
      'a role=button',
      () => {
        const el = document.createElement('div');
        el.setAttribute('role', 'button');
        el.tabIndex = 0;
        return el;
      },
    ],
    [
      'a checkbox',
      () => {
        const el = document.createElement('input');
        el.type = 'checkbox';
        return el;
      },
    ],
  ])('leaves Space alone when %s has focus', (_label, make) => {
    // Space activates the focused control. Claiming it would break every
    // button on the surface — "Skip" on the onboarding strip, the thread rows,
    // the scroll-to-bottom affordance.
    const control = make();
    document.body.appendChild(control);
    control.focus();
    expect(shouldRedirectKeyToComposer(key({ key: ' ' }), composer, root)).toBe(false);
  });

  it('still claims Space when focus is not on a control', () => {
    // A leading space is a real keystroke — dropping it everywhere would eat
    // the first character of "  hello" typed into dead space.
    expect(shouldRedirectKeyToComposer(key({ key: ' ' }), composer, root)).toBe(true);
  });

  it('yields to an open modal that does not contain the composer', () => {
    const dialog = document.createElement('div');
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-modal', 'true');
    // A modal is usually position:fixed, for which offsetParent is null — the
    // visibility probe must not be fooled by that.
    vi.spyOn(dialog, 'getClientRects').mockReturnValue([
      { width: 100, height: 100 } as DOMRect,
    ] as unknown as DOMRectList);
    document.body.appendChild(dialog);
    expect(shouldRedirectKeyToComposer(key({ key: 'h' }), composer, root)).toBe(false);
  });

  it('ignores a closed drawer that stays mounted', () => {
    const drawer = document.createElement('div');
    drawer.setAttribute('role', 'dialog');
    drawer.setAttribute('aria-modal', 'false');
    drawer.setAttribute('aria-hidden', 'true');
    document.body.appendChild(drawer);
    expect(shouldRedirectKeyToComposer(key({ key: 'h' }), composer, root)).toBe(true);
  });

  it('keeps working when a modal is open but focus is inside the chat', () => {
    // The dock stays reachable beside an entry dialog (Modal reserves the dock
    // column when a dialog opts in), so clicking into the transcript and
    // typing has to reach the composer. Focus inside the surface is the
    // signal; a modal only wins when focus is elsewhere.
    const dialog = document.createElement('div');
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-modal', 'true');
    vi.spyOn(dialog, 'getClientRects').mockReturnValue([
      { width: 100, height: 100 } as DOMRect,
    ] as unknown as DOMRectList);
    document.body.appendChild(dialog);

    const inSurface = document.createElement('button');
    root.appendChild(inSurface);
    inSurface.focus();

    expect(shouldRedirectKeyToComposer(key({ key: 'h' }), composer, root)).toBe(true);
  });

  it('stands down entirely while an edit composer is mounted', () => {
    // Mid-edit, "type anywhere" routing a stray key into the SEND box would
    // silently start drafting a new message out of view — worse than doing
    // nothing. The edit input autoFocuses; this covers the moment after focus
    // wanders off it.
    const edit = document.createElement('textarea');
    edit.setAttribute('aria-label', 'Edit message');
    root.appendChild(edit);
    expect(shouldRedirectKeyToComposer(key({ key: 'h' }), composer, root)).toBe(false);
    root.removeChild(edit);
    expect(shouldRedirectKeyToComposer(key({ key: 'h' }), composer, root)).toBe(true);
  });

  it('does not claim keys for a surface the user is not in', () => {
    const other = document.createElement('div');
    const otherButton = document.createElement('button');
    other.appendChild(otherButton);
    document.body.appendChild(other);
    otherButton.focus();
    expect(shouldRedirectKeyToComposer(key({ key: 'h' }), composer, root)).toBe(false);
  });
});

describe('appendCharToComposer', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('delivers the character through React onChange, not just the DOM', () => {
    // The whole point of going via the native setter + input event: assigning
    // `.value` directly leaves React's state stale, so the send button and the
    // tag autocomplete never see the text.
    function Harness() {
      const [value, setValue] = useState('');
      return (
        <textarea
          aria-label="Message input"
          value={value}
          onChange={(e) => setValue(e.target.value)}
        />
      );
    }
    render(<Harness />);
    const composer = screen.getByLabelText('Message input') as HTMLTextAreaElement;

    appendCharToComposer(composer, 'h');
    expect(composer.value).toBe('h');
    appendCharToComposer(composer, 'i');
    expect(composer.value).toBe('hi');
    expect(document.activeElement).toBe(composer);
    expect(composer.selectionStart).toBe(2);
  });
});

describe('useTypeAnywhereComposer', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('routes a stray keystroke into the composer and consumes the event', () => {
    function Surface() {
      const ref = useRef<HTMLDivElement | null>(null);
      const [value, setValue] = useState('');
      useTypeAnywhereComposer(ref);
      return (
        <div ref={ref} {...{ [CHAT_SURFACE_ATTR]: '' }}>
          <button type="button">somewhere else</button>
          <textarea
            aria-label="Message input"
            value={value}
            onChange={(e) => setValue(e.target.value)}
          />
        </div>
      );
    }
    render(<Surface />);
    const composer = screen.getByLabelText('Message input') as HTMLTextAreaElement;
    screen.getByRole('button').focus();

    const event = key({ key: 'h' });
    window.dispatchEvent(event);

    expect(composer.value).toBe('h');
    expect(event.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(composer);
  });

  it('stops listening once the surface unmounts', () => {
    function Surface() {
      const ref = useRef<HTMLDivElement | null>(null);
      const [value, setValue] = useState('');
      useTypeAnywhereComposer(ref);
      return (
        <div ref={ref} {...{ [CHAT_SURFACE_ATTR]: '' }}>
          <textarea
            aria-label="Message input"
            value={value}
            onChange={(e) => setValue(e.target.value)}
          />
        </div>
      );
    }
    const { unmount } = render(<Surface />);
    unmount();

    const event = key({ key: 'h' });
    window.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
  });
});
