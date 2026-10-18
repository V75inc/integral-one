import { useLocation } from "react-router-dom";
import { MessageSquare } from "lucide-react";

import { useAgentInbox } from "../inbox/useAgentInbox";
import "../inbox/inbox.css";

import { LINE_ICON_STROKE } from "../../../components/ui";
import {
  isDockSuppressedPath,
  useAssistantDock,
} from "../../../context/AssistantDockContext";

/**
 * Floating toggle for the assistant dock. Split out of the old Launcher so
 * the trigger and the surface are separate components — the dock can now be
 * opened from anywhere (command palette, page affordances, the handoff bus)
 * without going through this button.
 */
export function AssistantDockToggle() {
  const { pathname } = useLocation();
  const { open, openDock } = useAssistantDock();
  // Only while the dock is shut: open, the header tab owns the count, and
  // two badges for one number is noise.
  const { actionableCount } = useAgentInbox({ enabled: !open });

  if (open) return null;
  if (isDockSuppressedPath(pathname)) return null;

  return (
    <button
      type="button"
      /* Restore whichever tab was last open rather than forcing Chat. This
         button carries the inbox count, and forcing Chat meant clicking a
         badge that says "2 awaiting you" landed you somewhere other than the
         two things it counted. Written before the Inbox tab existed. */
      onClick={() => openDock()}
      aria-label="Open Integral coworker"
      title="Open Integral coworker"
      /* `bottom`/`right` use safe-area-inset offsets so the button sits
         above the iOS home indicator on devices with a notch. On desktop
         the inset resolves to 0 and the original 24px offset wins. */
      style={{
        bottom: "calc(env(safe-area-inset-bottom, 0px) + 1.25rem)",
        right: "calc(env(safe-area-inset-right, 0px) + 1.25rem)",
      }}
      className="
        fixed z-dock flex h-12 w-12 items-center justify-center
        rounded-full bg-[var(--cta-bg)] text-[var(--cta-fg)]
        shadow-[var(--shadow-pop)] transition hover:bg-[var(--cta-hover)]
        focus:outline-none focus:ring-2 focus:ring-[var(--focus-ring-color)]
      "
    >
      <MessageSquare size={20} strokeWidth={LINE_ICON_STROKE} />
      {actionableCount > 0 ? (
        <span
          className="dock-toggle-count"
          aria-label={`${actionableCount} awaiting you`}
        >
          {actionableCount}
        </span>
      ) : null}
    </button>
  );
}
