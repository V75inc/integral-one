import { useCallback, useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";

import {
  isDockSuppressedPath,
  useAssistantDock,
} from "../../../context/AssistantDockContext";
import { useIsMdUp } from "../../../hooks/useMediaQuery";
import { useRegisterOverlay } from "../../../hooks/useOverlayPresence";
import { DOCK_MAX_WIDTH, DOCK_MIN_WIDTH } from "./assistantDockPrefs";

// The shell already imports the chat runtime through the ai-chat facade.
// Import this small body with it so opening/restoring the dock never depends
// on an extra module request. The runtime still mounts only while chat is open.
import AssistantDockBody from "./AssistantDockBody";

/**
 * The resident assistant's home in the app shell.
 *
 * Desktop: a right-anchored dock that squeezes `<main>` rather than covering
 * it — the page stays fully usable while the assistant is open, which is what
 * makes "conversation is the primary surface" true rather than aspirational.
 * Mobile: a full-bleed sheet, since squeezing a phone viewport is pointless.
 *
 * Deliberately NOT modal. It sits on `z-dock`, below `z-overlay`, so dialogs
 * it raises (a confirm on a staged change) render above it, and it does not
 * register as a viewport-blocking overlay on desktop.
 */
export function AssistantDock() {
  const { pathname } = useLocation();
  const isMdUp = useIsMdUp();
  const { open, width, closeDock, setWidth, setResizing } = useAssistantDock();

  // Only the mobile sheet blocks the viewport; the desktop dock is a
  // companion column and must not make toasts flee to the other corner.
  useRegisterOverlay(open && !isMdUp);

  // Escape closes only when focus is inside the dock. A non-modal companion
  // stealing the global Escape would close it while the user is dismissing
  // something else entirely (a dialog it raised, a menu, a filter popover).
  const panelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      const active = document.activeElement;
      if (panelRef.current && active && panelRef.current.contains(active)) {
        closeDock();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, closeDock]);

  // Drag-to-resize. Pointer capture keeps the drag alive when the cursor
  // outruns the 4px handle, which it always does.
  const onHandlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!isMdUp) return;
      e.preventDefault();
      e.currentTarget.setPointerCapture(e.pointerId);
      setResizing(true);
    },
    [isMdUp, setResizing],
  );

  const onHandlePointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;
      // Dock is right-anchored, so width grows as the pointer moves left.
      setWidth(window.innerWidth - e.clientX);
    },
    [setWidth],
  );

  const endResize = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
      setResizing(false);
    },
    [setResizing],
  );

  // Keyboard resize, so the handle is not a mouse-only affordance. Nudges go
  // through an updater rather than `width + step`: key-repeat fires faster
  // than React re-renders, and a stale closure would collapse a held arrow
  // key into a single step.
  const onHandleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      const step = e.shiftKey ? 48 : 16;
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        setWidth(w => w + step);
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        setWidth(w => w - step);
      }
    },
    [setWidth],
  );

  if (!open) return null;
  // The dedicated chat route already owns a full-viewport surface.
  if (isDockSuppressedPath(pathname)) return null;

  return (
    <div
      ref={panelRef}
      role="complementary"
      aria-label="AI chat"
      /* Read by Modal's focus trap: a dialog that opts into
         `allowAssistantDock` extends its Tab cycle across this element so the
         visually-reachable dock is keyboard-reachable too. */
      data-assistant-dock=""
      className={[
        "fixed z-dock flex flex-col overflow-hidden bg-[var(--section-bg)] shadow-none",
        isMdUp
          ? "right-0 border-l border-[var(--panel-border)]"
          : "left-0 right-0",
      ].join(" ")}
      /* Both layouts start BELOW the system notification bar. The bar sits on
         `z-system-bar`, above the dock, so a mobile sheet pinned to `inset-0`
         has its own header — and therefore its close button — painted over
         and unreachable. Desktop differs only in taking a fixed width instead
         of the full viewport. */
      style={{
        top: "var(--system-bar-h, 0px)",
        height: "calc(100vh - var(--system-bar-h, 0px))",
        ...(isMdUp ? { width: `${width}px` } : null),
      }}
    >
      {isMdUp ? (
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize assistant panel"
          aria-valuenow={width}
          aria-valuemin={DOCK_MIN_WIDTH}
          aria-valuemax={DOCK_MAX_WIDTH}
          tabIndex={0}
          onPointerDown={onHandlePointerDown}
          onPointerMove={onHandlePointerMove}
          onPointerUp={endResize}
          onPointerCancel={endResize}
          onKeyDown={onHandleKeyDown}
          /* Straddles the dock edge (`-translate-x-1/2`) so the grab target
             is 8px wide rather than the 4px of visible border — same
             treatment as the TrackDetailPage column resizer. A hairline
             handle is accurate to look at and miserable to hit. */
          className="
            absolute left-0 top-0 z-10 h-full w-2 -translate-x-1/2 cursor-ew-resize
            hover:bg-[var(--panel-border)]
            focus:outline-none focus-visible:bg-[var(--brand-accent)]
            transition-colors duration-fast
          "
        />
      ) : null}

      <AssistantDockBody onClose={closeDock} />
    </div>
  );
}
