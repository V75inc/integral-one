import { getCaretCoordinates } from './caretCoordinates';

export interface MentionPopoverAnchor {
  top: number;
  left: number;
  transform?: string;
  maxHeight?: number;
  placement?: 'above' | 'below';
}

/** Viewport-fixed anchor for MentionPopover (portal at document.body). */
export function getMentionPopoverAnchor(
  el: HTMLTextAreaElement | HTMLInputElement,
  caret: number,
): MentionPopoverAnchor | null {
  if (caret < 0) return null;
  const coords = getCaretCoordinates(el, caret);
  const rect = el.getBoundingClientRect();
  const POPOVER_MAX_HEIGHT = 380;
  const GAP = 8;
  const viewportHeight =
    typeof window !== 'undefined' ? window.innerHeight : 1000;
  const viewportWidth =
    typeof window !== 'undefined' ? window.innerWidth : 1200;
  const caretViewportTop = rect.top + coords.top;
  const caretViewportBottom = caretViewportTop + coords.height;
  const spaceBelow = Math.max(0, viewportHeight - caretViewportBottom - GAP);
  const spaceAbove = Math.max(0, caretViewportTop - GAP);

  // If space below is insufficient and space above has more room, prefer above.
  const placement: 'below' | 'above' =
    spaceBelow < POPOVER_MAX_HEIGHT && spaceAbove > spaceBelow
      ? 'above'
      : spaceBelow >= POPOVER_MAX_HEIGHT
        ? 'below'
        : spaceAbove > spaceBelow
          ? 'above'
          : 'below';

  const availableHeight = placement === 'above' ? spaceAbove : spaceBelow;
  const maxHeight = Math.max(160, Math.min(POPOVER_MAX_HEIGHT, availableHeight - 16));

  // Clamp left so the popover doesn't overflow viewport on left or right.
  const estimatedWidth = 380;
  const rawLeft = rect.left + coords.left - 4;
  const left = Math.max(12, Math.min(rawLeft, viewportWidth - estimatedWidth - 16));

  return {
    top:
      placement === 'below'
        ? caretViewportBottom + GAP
        : caretViewportTop - GAP,
    left,
    transform: placement === 'above' ? 'translateY(-100%)' : undefined,
    maxHeight,
    placement,
  };
}
