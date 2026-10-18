import { useEffect, useRef } from 'react';

import { useAssistantDock } from '../../../context/AssistantDockContext';
import { useIsMdUp } from '../../../hooks/useMediaQuery';

/**
 * Collapses the left sidebar while the assistant dock is open, and restores
 * it on close.
 *
 * Two rails plus a dock leaves the page column too narrow to be useful — the
 * squeeze is what makes the dock non-modal, so it has to come from somewhere.
 * The sidebar is the cheaper of the two to give up: it is navigation the user
 * is not currently using, and it stays present as an icon rail.
 *
 * Restores only what it took. If the sidebar was already collapsed when the
 * dock opened, closing the dock leaves it collapsed; and if the user expands
 * it themselves mid-session, that wins and no restore happens. Anything else
 * would override a deliberate choice with a remembered one.
 *
 * Headless: `Layout` owns the sidebar state but also *provides* the dock
 * context, so it cannot consume it. This component sits inside the provider
 * and drives the state through callbacks.
 *
 * Desktop only. On mobile the dock is a full-bleed sheet and the sidebar is
 * an overlay drawer — neither competes for width, so there is nothing to
 * trade away.
 */
export function SidebarDockSync({
  collapsed,
  onCollapsedChange,
}: {
  collapsed: boolean;
  onCollapsedChange: (collapsed: boolean) => void;
}) {
  const { open } = useAssistantDock();
  const isMdUp = useIsMdUp();

  // Starts false so a mount with the dock already restored-open (its state
  // persists across reloads; the sidebar's does not) still counts as an
  // opening transition and collapses the rail.
  const wasOpen = useRef(false);
  const autoCollapsed = useRef(false);

  useEffect(() => {
    const opening = open && !wasOpen.current;
    const closing = !open && wasOpen.current;
    wasOpen.current = open;

    if (!isMdUp) return;

    if (opening) {
      if (!collapsed) {
        autoCollapsed.current = true;
        onCollapsedChange(true);
      }
      return;
    }

    if (closing) {
      if (autoCollapsed.current) {
        autoCollapsed.current = false;
        onCollapsedChange(false);
      }
      return;
    }

    // Not a transition: the user expanded the rail themselves while the dock
    // is open. Drop the claim so closing the dock does not re-apply a
    // collapse they just undid.
    if (open && !collapsed) autoCollapsed.current = false;
  }, [open, isMdUp, collapsed, onCollapsedChange]);

  return null;
}
