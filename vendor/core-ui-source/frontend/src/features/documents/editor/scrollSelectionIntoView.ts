import type { EditorView } from '@tiptap/pm/view';

const SCROLL_CONTAINER_SELECTOR = '.doc-editor-scroll';
const EDGE_MARGIN_PX = 28;

/**
 * Keep selection visible inside the document canvas scroll box only.
 * Returning true suppresses ProseMirror's default scroll (which walks all
 * ancestors and often jumps the main page to the top).
 */
export function scrollDocEditorSelectionIntoView(view: EditorView): boolean {
  const root = view.dom.closest(SCROLL_CONTAINER_SELECTOR);
  if (!(root instanceof HTMLElement)) {
    return false;
  }

  const { from } = view.state.selection;
  let coords: { top: number; bottom: number };
  try {
    coords = view.coordsAtPos(from);
  } catch {
    return true;
  }

  const box = root.getBoundingClientRect();
  const scroller =
    root.scrollHeight > root.clientHeight + 1
      ? root
      : document.scrollingElement;
  if (!scroller) return true;
  if (coords.top < box.top + EDGE_MARGIN_PX) {
    scroller.scrollTop -= box.top + EDGE_MARGIN_PX - coords.top;
  } else if (coords.bottom > box.bottom - EDGE_MARGIN_PX) {
    scroller.scrollTop += coords.bottom - box.bottom + EDGE_MARGIN_PX;
  }
  return true;
}
