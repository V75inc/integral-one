import { useEffect } from "react";

import { setComposerValue } from "./composerDom";

/**
 * Route stray keystrokes on a chat surface into the composer.
 *
 * The composer already `autoFocus`es on mount, so arriving on `/agent` or
 * opening the dock lands the caret in the right place. What did not work is
 * everything after that: click a message to copy it, tab to the scroll region,
 * dismiss a popover — focus is now on a button or the body, and typing goes
 * nowhere at all. Reported as "the chat bar should be automatically active …
 * any text entered while on the chat interface should automatically be
 * directed to the chat bar".
 *
 * Rather than fight for focus on every render (which steals it back from
 * anything the user deliberately focused, and breaks the edit-message
 * composer), this listens for the first printable keystroke that nothing else
 * wants and hands it to the composer.
 *
 * The character is replayed by setting `value` through the native setter and
 * dispatching `input`, not by relying on focus-during-keydown to redirect the
 * browser's own insertion. That behaviour differs across engines — Safari is
 * where the QA report came from — and this way one code path produces the same
 * result everywhere. Going through `input` (rather than assigning `.value`)
 * is what makes React's `onChange` fire, so the composer state, the tag
 * autocomplete and the send button all see the text.
 */

/** Keys we let through untouched. */
function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
}

/**
 * Space activates the focused control. Claiming it would break every button,
 * checkbox and disclosure on the surface — including "Skip" on the onboarding
 * strip and the thread rows themselves.
 */
function isActivationKeyOnAControl(event: KeyboardEvent): boolean {
  if (event.key !== " ") return false;
  const target = document.activeElement;
  if (!(target instanceof HTMLElement)) return false;
  if (target.tagName === "BUTTON" || target.tagName === "SUMMARY") return true;
  if (target.getAttribute("role") === "button") return true;
  if (target.getAttribute("role") === "checkbox") return true;
  if (target instanceof HTMLInputElement) {
    return target.type === "checkbox" || target.type === "radio";
  }
  return false;
}

/**
 * A modal that does not contain the composer owns the keyboard — typing into
 * the chat behind it would be invisible to the user.
 *
 * Unless the user is demonstrably working in the chat: with the dock reachable
 * beside an entry dialog (Modal reserves the dock column), clicking into the
 * transcript and typing has to reach the composer. Focus inside the surface is
 * the signal — if it is anywhere else, the modal still wins.
 */
function isBlockedByModal(
  composer: HTMLTextAreaElement,
  root: HTMLElement | null,
): boolean {
  if (root && root.contains(document.activeElement)) return false;
  const dialogs = document.querySelectorAll<HTMLElement>(
    '[role="dialog"][aria-modal="true"], [role="alertdialog"][aria-modal="true"]',
  );
  for (const dialog of dialogs) {
    // The conversations drawer stays mounted and slides off-screen; it marks
    // itself aria-hidden while closed.
    if (dialog.getAttribute("aria-hidden") === "true") continue;
    // NOT `offsetParent === null`: that is null for every `position: fixed`
    // element, which is what a modal usually is — the check would skip the
    // dialogs it exists to catch. `getClientRects()` is empty only when the
    // element is genuinely not rendered.
    if (dialog.getClientRects().length === 0) continue;
    if (!dialog.contains(composer)) return true;
  }
  return false;
}

/**
 * The dock and `/agent` can both have a thread mounted. Only the surface the
 * user is actually working in should swallow the keystroke: either focus is
 * already inside it, or focus is nowhere (body) — which is what happens after
 * closing a popover or clicking dead space.
 */
export function isActiveSurface(root: HTMLElement | null): boolean {
  if (!root || !root.isConnected) return false;
  const active = document.activeElement;
  // Focus nowhere: the only mounted surface takes it. `AssistantDock` returns
  // null on `/agent` (isDockSuppressedPath), so the dock and the full-page
  // thread never coexist — there is no second claimant to arbitrate against.
  // Deliberately NOT an offsetParent/visibility probe: offsetParent is null for
  // any `position: fixed` ancestor chain, so that test fails on exactly the
  // surface it is meant to admit.
  if (!active || active === document.body) return root.dataset.chatSurface !== 'home';
  return root.contains(active);
}

/** The in-place edit composer's accessible name (set in Thread.tsx). */
export const EDIT_COMPOSER_SELECTOR = 'textarea[aria-label="Edit message"]';

export function shouldRedirectKeyToComposer(
  event: KeyboardEvent,
  composer: HTMLTextAreaElement | null,
  root: HTMLElement | null = composer?.closest<HTMLElement>("[data-chat-surface]") ?? null,
): boolean {
  if (!composer) return false;
  if (!isActiveSurface(root)) return false;
  // An open edit composer owns the surface's keystrokes. Routing a stray key
  // to the SEND box while the user is editing a message would start drafting
  // a new message out of view — worse than doing nothing. The edit input
  // autoFocuses, so this only matters after focus wanders (click, Escape from
  // a popover); standing down entirely is the predictable behaviour.
  if (root?.querySelector(EDIT_COMPOSER_SELECTOR)) return false;
  if (composer.disabled || composer.readOnly) return false;
  if (event.defaultPrevented) return false;
  // ⌘K, ⌃C, ⌥→ and every other shortcut stays a shortcut.
  if (event.metaKey || event.ctrlKey || event.altKey) return false;
  // Printable characters only: a single-code-point `key` excludes Tab, Escape,
  // Enter, arrows and the F-keys, which navigate rather than type.
  if (event.key.length !== 1) return false;
  if (isActivationKeyOnAControl(event)) return false;
  if (isEditableTarget(event.target)) return false;
  if (document.activeElement === composer) return false;
  if (isBlockedByModal(composer, root)) return false;
  return true;
}

/** Append `char` so React sees a real input event. */
export function appendCharToComposer(
  composer: HTMLTextAreaElement,
  char: string,
): void {
  const next = `${composer.value}${char}`;
  setComposerValue(composer, next);
  composer.focus();
  // Caret to the end — `focus()` alone can restore a stale selection.
  composer.setSelectionRange(next.length, next.length);
}

/** Marks a chat surface root, so a keystroke can be attributed to one. */
export const CHAT_SURFACE_ATTR = "data-chat-surface";

/** The composer's stable handle — also what the a11y tree exposes. */
export const COMPOSER_SELECTOR = 'textarea[aria-label="Message input"]';

/**
 * @param rootRef the thread root. Read per keystroke rather than captured,
 *   because the composer remounts on thread switch and provider change.
 */
export function useTypeAnywhereComposer(
  rootRef: { current: HTMLElement | null },
): void {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const root = rootRef.current;
      const composer = root?.querySelector<HTMLTextAreaElement>(COMPOSER_SELECTOR) ?? null;
      if (!shouldRedirectKeyToComposer(event, composer, root) || !composer) return;
      event.preventDefault();
      appendCharToComposer(composer, event.key);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [rootRef]);
}
