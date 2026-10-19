/**
 * caret-coordinates — measure the (x, y) pixel offset of a caret
 * position inside a ``<textarea>`` or single-line ``<input>``,
 * relative to the element's bounding box.
 *
 * Strategy: a hidden mirror ``<div>`` is created with the same
 * computed styling as the host (font, padding, border, line-height,
 * width, etc.). The mirror's text content is set to the host's value
 * up to the caret, then a sentinel ``<span>`` is appended. The
 * sentinel's offsetTop / offsetLeft inside the mirror equals the
 * caret's position inside the host (with one tiny adjustment for the
 * host's scrollTop).
 *
 * Adapted from the textarea-caret-position algorithm (Component
 * package by Jonathan Ong) — distilled to the props that matter for
 * mention popovers, no IE quirks.
 */
const MIRROR_PROPS = [
  'direction',
  'boxSizing',
  'width',
  'height',
  'overflowX',
  'overflowY',
  'borderTopWidth',
  'borderRightWidth',
  'borderBottomWidth',
  'borderLeftWidth',
  'borderStyle',
  'paddingTop',
  'paddingRight',
  'paddingBottom',
  'paddingLeft',
  'fontStyle',
  'fontVariant',
  'fontWeight',
  'fontStretch',
  'fontSize',
  'fontSizeAdjust',
  'lineHeight',
  'fontFamily',
  'textAlign',
  'textTransform',
  'textIndent',
  'textDecoration',
  'letterSpacing',
  'wordSpacing',
  'tabSize',
  'whiteSpace',
  'wordWrap',
  'wordBreak',
] as const;

export interface CaretCoords {
  /** Offset from the host's top edge to the top of the caret's line. */
  top: number;
  /** Offset from the host's left edge to the caret's character position. */
  left: number;
  /** Pixel height of the caret's line (matches font line-height). */
  height: number;
}

export function getCaretCoordinates(
  element: HTMLTextAreaElement | HTMLInputElement,
  position: number,
): CaretCoords {
  if (typeof document === 'undefined') {
    return { top: 0, left: 0, height: 0 };
  }
  const isInput = element.nodeName === 'INPUT';

  const mirror = document.createElement('div');
  mirror.id = 'caret-coords-mirror';
  document.body.appendChild(mirror);

  const style = mirror.style;
  const computed = window.getComputedStyle(element);

  style.whiteSpace = 'pre-wrap';
  if (!isInput) {
    style.wordWrap = 'break-word';
  }

  style.position = 'absolute';
  style.visibility = 'hidden';
  // Off-screen positioning so the mirror doesn't flash.
  style.top = '-9999px';
  style.left = '-9999px';

  for (const prop of MIRROR_PROPS) {
    const value = computed.getPropertyValue(prop as string);
    if (value) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (style as any)[prop] = value;
    }
  }

  if (isInput) {
    style.lineHeight = computed.height;
    style.overflow = 'hidden';
  }

  mirror.textContent = element.value.substring(0, position);
  if (isInput) {
    mirror.textContent = (mirror.textContent || '').replace(/\s/g, ' ');
  }

  const span = document.createElement('span');
  // Sentinel character ensures the span has a non-zero footprint at
  // the caret position (an empty span collapses to 0×0).
  span.textContent = element.value.substring(position) || '.';
  mirror.appendChild(span);

  const result: CaretCoords = {
    top: span.offsetTop + parseInt(computed.borderTopWidth, 10),
    left: span.offsetLeft + parseInt(computed.borderLeftWidth, 10),
    height: parseInt(computed.lineHeight, 10) || parseInt(computed.fontSize, 10) || 16,
  };

  document.body.removeChild(mirror);

  // Account for the host's vertical scroll (textarea scrolled down →
  // caret's apparent position rises).
  result.top -= element.scrollTop;
  result.left -= element.scrollLeft;
  return result;
}
