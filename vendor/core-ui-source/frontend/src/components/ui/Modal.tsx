import { useEffect, useId, useRef, type ReactNode, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { IconWell, LINE_ICON_STROKE } from './IconWell';
import { useRegisterOverlay } from '../../hooks/useOverlayPresence';

interface ModalProps {
  open: boolean;
  onClose(): void;
  /**
   * Header title. Strings render as plain text inside the `<h2>` (the
   * common case). ReactNode lets callers compose richer headers — color
   * dot + title text + provenance badge, etc. The wrapping `<h2>` keeps
   * `aria-labelledby` valid regardless.
   */
  title?: string | React.ReactNode;
  /** Line icon shown in a small panel background beside the title */
  titleIcon?: React.ReactNode;
  /**
   * Additional buttons rendered in the header rail, immediately before
   * the auto-rendered close button. Use for surface-specific actions
   * (e.g. Edit toggle on EntryDetail). Each child should be a small
   * icon button matching the close-button visual treatment.
   */
  headerActions?: React.ReactNode;
  children: React.ReactNode;
  /**
   * Tailwind `max-w-*` token capping the dialog at sm+.
   *
   * **Standard.** Default is `max-w-dialog-form` (720px via
   * `--dialog-w-form`) to match the EntryDetail dialog baseline. Every
   * control modal (forms, multi-step flows, pickers, settings panels)
   * should rely on this default so the app presents one consistent
   * dialog width.
   *
   * **Exceptions** — pass an explicit width only for:
   * - Confirmation prompts (short message + yes/no): `max-w-dialog-confirm`.
   * - Media / pixel-perfect viewers (e.g. AttachmentViewer): `max-w-dialog-wide`.
   * - Multi-pane builders (e.g. View Designer): `max-w-dialog-workspace`
   *   or expanded `max-w-dialog-workspace-max`.
   *
   * Source-of-truth tokens: `--dialog-w-confirm` / `--dialog-w-form` /
   * `--dialog-w-wide` / `--dialog-w-workspace` / `--dialog-w-workspace-max`
   * in `src/index.css`. New widths require updating the token set, not
   * passing an arbitrary value.
   *
   * @deprecated Free-form `max-w-*` arbitrary values. Use the dialog
   * tokens above. ESLint enforces (Phase 3-A).
   */
  width?: string;
  /**
   * Tall workspace shell: ~85vh floor and 95vh cap at sm+. Use for
   * multi-pane builders that need a large live preview (View Designer).
   * Leaves standard control modals content-sized.
   */
  tall?: boolean;
  /**
   * Visual variant.
   *
   * - `default` (most callers): on mobile the dialog goes full-bleed —
   *   fills the viewport, no rounding, header pinned at the top. On
   *   sm+ it reverts to the centered floating dialog with `width`.
   * - `compact`: keeps the dialog small on every viewport. Used by
   *   confirm-style prompts where the message is short and a full
   *   takeover would feel disproportionate.
   */
  variant?: 'default' | 'compact';
  /** Right-aligned, full-height drawer using the same focus and dismissal contract. */
  placement?: 'center' | 'right';
  /**
   * Companion column rendered INSIDE this dialog, to the right of the body.
   * The standard home for surfaces that comment on a record rather than
   * form part of it — discussion, attachments, activity.
   *
   * Passing it widens the SAME dialog (`max-w-dialog-form` ->
   * `max-w-dialog-wide`) rather than raising a second card beside it, so
   * there is one surface on screen and the record stays in view while the
   * column is open. Below the `sm` breakpoint the dialog is already
   * full-bleed, so the column is not rendered there.
   *
   * Visibility is the caller's state — pass `undefined` to render nothing.
   * Pair it with a toggle in `headerActions` so the control sits in the
   * dialog header on every surface that has one.
   */
  sidePanel?: React.ReactNode;
  /**
   * This dialog is a record surface that owns a companion panel, even when
   * the panel is not on screen right now.
   *
   * Drives the height floor. Keying the floor on `sidePanel` alone was wrong:
   * callers pass `undefined` both when the user hides the panel and when it
   * stacks into the body on a narrow container, so the dialog lost its floor
   * and snapped back to content height in exactly the cases the floor exists
   * for. Defaults to `!!sidePanel` so callers that only ever render a column
   * behave as before.
   */
  hasCompanionPanel?: boolean;
  /**
   * Skip Modal's built-in `Escape` → `onClose` handler. Use when the
   * caller needs to defer ESC to an inner editor (e.g. EntryDetail's
   * inline edit form on the same sheet should consume ESC for its
   * cancel path before the dialog closes). Caller becomes responsible
   * for wiring its own document-level keydown listener.
   */
  disableEscape?: boolean;
  /**
   * When set, focus this element on open instead of the first focusable
   * control in the header (usually the close button). Used by create
   * dialogs so quick-add typing continues in the title field.
   */
  initialFocusRef?: RefObject<HTMLElement | null>;
  /**
   * Leave the assistant dock outside the overlay so it stays usable while
   * this dialog is open.
   *
   * **Opt-in, and it should stay that way.** For a confirm prompt ("delete
   * this entry?") a reachable chat is a distraction from a decision the
   * dialog is asking for, so the default stays a full-viewport modal.
   *
   * When opted in, the contract is kept honest end to end: the overlay stops
   * at the dock's edge, the Tab cycle extends across the dock (see the focus
   * trap below), and `aria-modal` is omitted — a dialog with a deliberately
   * live companion surface is a non-modal dialog, and claiming otherwise
   * would tell a screen-reader user the surface they can reach does not
   * exist.
   *
   * Known residual: Tab is confined to panel + dock, but a screen reader's
   * VIRTUAL cursor can still browse the page behind (no `inert` on it).
   * Honest for a companion dialog; full inertness would require marking the
   * rest of the app `inert` while open — a separate, riskier change.
   *
   * It earns its place on content dialogs that publish themselves as the
   * agent's context — `EntryDetail` sets `pageKind: "entry_dialog"` with the
   * focused entry, so the assistant is primed to talk about exactly what you
   * are looking at, and the dock being covered was the QA report "quick access
   * chat no longer supports conversation with selected entries".
   */
  allowAssistantDock?: boolean;
}

let scrollLocks = 0;
let previousBodyOverflow = '';

function focusElement(el: HTMLElement) {
  el.focus({ preventScroll: true });
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
    const len = el.value.length;
    el.setSelectionRange(len, len);
  }
}

export function Modal({
  open,
  onClose,
  title,
  titleIcon,
  headerActions,
  children,
  width = 'max-w-dialog-form',
  variant = 'default',
  placement = 'center',
  sidePanel,
  hasCompanionPanel,
  tall = false,
  disableEscape = false,
  initialFocusRef,
  allowAssistantDock = false,
}: ModalProps) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const prevFocus = useRef<HTMLElement | null>(null);

  // Register this modal with the overlay-presence registry (nested overlay
  // counting). Dialogs render above the assistant surface — `z-overlay` beats
  // `z-dock` — so a confirm prompt raised from inside chat is reachable.
  useRegisterOverlay(open);

  useEffect(() => {
    if (open) {
      prevFocus.current = document.activeElement as HTMLElement | null;
      window.setTimeout(() => {
        const explicit = initialFocusRef?.current;
        if (explicit) {
          focusElement(explicit);
          return;
        }
        const root = panelRef.current;
        const focusable = root?.querySelector<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        if (focusable) focusElement(focusable);
      }, 0);
    } else {
      prevFocus.current?.focus?.();
    }
  }, [open, initialFocusRef]);

  // Nested dialogs share one body lock; closing a child keeps its parent locked.
  useEffect(() => {
    if (!open) return;
    if (scrollLocks++ === 0) previousBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      if (--scrollLocks === 0) document.body.style.overflow = previousBodyOverflow;
    };
  }, [open]);

  useEffect(() => {
    if (!open || disableEscape) return;
    const onKey = (e: KeyboardEvent) => {
      const modals = document.querySelectorAll('[data-integral-modal]');
      if (modals[modals.length - 1] !== panelRef.current) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose, disableEscape]);

  useEffect(() => {
    if (!open) return;
    const root = panelRef.current;
    if (!root) return;

    const focusableSelector =
      'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

    const getFocusable = () => {
      const scopes: HTMLElement[] = [root];
      // A dialog that leaves the dock visually reachable must leave it
      // keyboard-reachable too, or the clearance is mouse-only — the a11y gap
      // the first version of `allowAssistantDock` shipped with. The dock joins
      // the Tab cycle after the panel's own controls; the scrim still
      // intercepts clicks outside both.
      if (allowAssistantDock) {
        const dock = document.querySelector<HTMLElement>('[data-assistant-dock]');
        if (dock) scopes.push(dock);
      }
      return scopes.flatMap(scope =>
        Array.from(scope.querySelectorAll<HTMLElement>(focusableSelector)).filter(
          el => el.offsetParent !== null || el === document.activeElement,
        ),
      );
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;
      const modals = document.querySelectorAll('[data-integral-modal]');
      if (modals[modals.length - 1] !== root) return;
      const focusable = getFocusable();
      if (focusable.length === 0) return;
      const active = document.activeElement as HTMLElement | null;
      const index = active ? focusable.indexOf(active) : -1;
      // Rove explicitly on EVERY Tab rather than only intercepting at the
      // ends. With `allowAssistantDock` the cycle spans two disjoint subtrees
      // (panel + dock), and native Tab order between them runs through the
      // whole page behind the dialog: letting the browser handle the "middle"
      // of the cycle walks focus out of the panel's DOM-order end into the
      // sidebar. Verified live — panel-last → Tab escaped; explicit roving
      // keeps every hop inside the cycle in both directions.
      e.preventDefault();
      if (index === -1) {
        (e.shiftKey ? focusable[focusable.length - 1] : focusable[0]).focus();
        return;
      }
      const next =
        (index + (e.shiftKey ? -1 : 1) + focusable.length) % focusable.length;
      focusable[next].focus();
    };

    // The listener is bound to the panel, so it only fires once focus is
    // already inside it. Without seeding focus on open the trap is inert —
    // focus sits on <body> and Tab walks the page behind the modal. Respect
    // an autoFocus'd child by only seeding when focus is still outside.
    if (!root.contains(document.activeElement)) {
      const initial = getFocusable()[0] ?? root;
      initial.focus?.();
    }

    // Document-level, not panel-level: with `allowAssistantDock` the cycle
    // spans two disjoint subtrees, and a panel-bound listener never sees Tab
    // pressed inside the dock — focus would walk out the far side. Scoped by
    // the `focusable.includes` guard above, so non-member focus targets are
    // pulled back into the cycle from either direction.
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open, allowAssistantDock]);

  if (!open) return null;

  const fullBleed = variant === 'default';
  // Opening the companion column widens the SAME dialog. `dialog-wide` (1024px)
  // is the existing token that fits the standard 720px form plus a 360px
  // column; an arbitrary `max-w-[...]` here would sidestep the dialog width
  // token set the rest of the app is held to.
  // Workspace sizes (entry enlarge / View Designer) already exceed wide —
  // keep them when a side panel is open instead of downgrading.
  const isWorkspaceWidth =
    width === 'max-w-dialog-workspace' || width === 'max-w-dialog-workspace-max';
  const effectiveWidth =
    sidePanel && !isWorkspaceWidth ? 'max-w-dialog-wide' : width;

  /* A dialog carrying a companion column gets a floor near the window's
     height (with the 90vh cap it settles into a consistent 80–90vh band),
     so record surfaces stop resizing themselves around however much content
     they happen to hold.

     Only those dialogs. A floor on every standard dialog left sparse control
     surfaces stranded — Public Share Settings measured 61px of content in a
     788px shell, ~200px of dead space under its Close button.

     This doubles as the override for the mobile ``min-h-[100dvh]``, which is
     why it is a single class rather than one added beside ``sm:min-h-0``:
     two min-height utilities at the same breakpoint collide rather than
     compose.

     Keyed on ``hasCompanionPanel``, not on whether the column is rendered
     this frame. A record dialog keeps its shape when the panel is hidden or
     stacked; keying on ``sidePanel`` meant hiding the panel collapsed the
     dialog to its content height. */
  const holdsPanel = hasCompanionPanel ?? Boolean(sidePanel);
  // The system bar stays above overlays. Reserve its measured height in both
  // the container and panel sizing, including tall and mobile sheets.
  const heightFloor = tall
    ? 'sm:min-h-[calc(85dvh-var(--system-bar-h,0px))]'
    : holdsPanel
      ? 'sm:min-h-[calc(80dvh-var(--system-bar-h,0px))]'
      : 'sm:min-h-0';
  const heightCap = tall
    ? 'sm:max-h-[calc(95dvh-var(--system-bar-h,0px))]'
    : 'sm:max-h-[calc(90dvh-var(--system-bar-h,0px))]';
  // Outer container.
  //
  // Full-bleed mode: at mobile the panel is positioned absolutely to
  // `inset-0` so it explicitly owns every viewport pixel — flex
  // `justify-stretch` would have been simpler but Tailwind ≤ 3.3
  // doesn't ship that class. At sm+ the container becomes a centered
  // flex layout so the floating dialog reappears.
  //
  // Compact mode: traditional bottom-sheet on mobile, centered on sm+.
  const containerClass = placement === 'right'
    ? 'fixed inset-0 z-overlay flex items-stretch justify-end'
    : fullBleed
    ? 'fixed inset-0 z-overlay sm:flex sm:items-center sm:justify-center sm:p-4'
    : 'fixed inset-0 z-overlay flex items-end justify-center p-0 sm:items-center sm:p-4';
  // Panel.
  //
  // Full-bleed: positioned `absolute inset-0` so it truly fills the
  // viewport regardless of flex quirks or browser viewport unit
  // support. `h-screen` is the long-supported 100vh; on browsers that
  // recognise `dvh` the explicit `min-h-[100dvh]` lifts it slightly so
  // the panel survives mobile URL-bar transitions. At sm+ those mobile
  // sizes are overridden by `sm:relative sm:h-auto sm:w-full sm:inset-auto`.
  //
  // `width` is a Tailwind `max-w-*` token. We apply it unprefixed on
  // the panel: at sm+ it caps the dialog width, and on mobile the
  // explicit `inset-0` overrides any `max-w-*` because position takes
  // precedence over content sizing for absolutely positioned elements.
  const panelClass = placement === 'right'
    ? `relative bg-[var(--panel)] flex flex-col outline-none focus:outline-none h-[calc(100dvh-var(--system-bar-h,0px))] w-full ${effectiveWidth} overflow-hidden border-l border-[var(--panel-border)] shadow-[var(--shadow-pop)]`
    : fullBleed
    ? [
        'bg-[var(--panel)] flex flex-col outline-none focus:outline-none',
        // Mobile: fill the container below the system bar. Percent heights
        // track its available space as the banner wraps or dismisses. ``max-h-none`` and ``max-sm:max-w-none`` clear
        // any inherited cap on mobile — the ``max-sm:`` prefix scopes
        // the override to below the sm breakpoint so it doesn't
        // compete with the unprefixed ``${width}`` cap at sm+.
        // (Tailwind sorts arbitrary ``max-w-[Npx]`` differently from
        // named tokens; without ``max-sm:`` here, an arbitrary-value
        // width cap loses to ``max-w-none`` at desktop.)
        'absolute inset-0 h-full min-h-full w-full max-h-none max-sm:max-w-none rounded-none border-0 shadow-none',
        // sm+: re-enable normal floating-dialog flow. ``sm:h-auto``
        // unsets the mobile height; ``sm:w-full`` re-establishes flex
        // width inside the centered container before ``${width}`` caps it;
        // ``${heightFloor}`` clears the mobile ``min-h-[100dvh]`` above (see
        // its definition for why it is one class and not two).
        `sm:relative sm:inset-auto sm:h-auto ${heightFloor} sm:w-full ${effectiveWidth} ${heightCap}`,
        // `overflow-hidden` clips inner children (notably the sticky
        // header's bg-[var(--panel)] fill) to the panel's rounded
        // corners. Without it the header paints over the curve and the
        // dialog looks square-cornered at sm+.
        'sm:overflow-hidden sm:rounded-[var(--radius-card)] sm:border sm:border-[var(--panel-border)] sm:shadow-[var(--shadow-pop)]',
        'animate-slide-up',
      ].join(' ')
    : [
        'relative bg-[var(--panel)] flex flex-col outline-none focus:outline-none',
        `w-full ${effectiveWidth} max-h-[calc(95dvh-var(--system-bar-h,0px))] sm:max-h-[calc(90dvh-var(--system-bar-h,0px))]`,
        'rounded-t-[var(--radius-card)] sm:rounded-[var(--radius-card)]',
        'border border-[var(--panel-border)] shadow-[var(--shadow-pop)]',
        // Same rationale as the full-bleed branch — clip children at
        // the panel's rounded corners.
        'overflow-hidden',
        'animate-slide-up',
      ].join(' ');

  // Portal to body so `position: fixed` is viewport-relative. Ancestors with
  // backdrop-filter / transform create a containing block and would otherwise
  // pin the overlay to e.g. the sticky header.
  return createPortal(
    <div
      className={containerClass}
      /* Opt-in only (`allowAssistantDock`): stop at the dock's left edge
         instead of covering it. `inset-0` put the scrim over the dock, so
         opening an entry — the moment you most want to ask the assistant
         about it, and the moment EntryDetail publishes that entry as the
         agent's dialog context — left the composer visible but dead behind
         the scrim. Reported as "quick access chat no longer supports
         conversation with selected entries".
         Default off because `aria-modal` promises the rest of the page is
         inert; a confirm prompt should not leave a live chat beside it.
         The var is published by AssistantDockContext and is already 0
         whenever the dock isn't squeezing (closed, mobile, /agent), so even
         when opted in this is inert in every other case. */
      style={{
        top: 'var(--system-bar-h, 0px)',
        ...(allowAssistantDock ? { right: 'var(--assistant-dock-w, 0px)' } : {}),
      }}
    >
      {/* Quiet Premium scrim — softer than 40% so the editorial
          surfaces below remain legible and the dialog reads as a beat
          rather than a curtain. */}
      <div
        className="absolute inset-0 bg-black/55 backdrop-blur-[2px]"
        onClick={onClose}
        aria-hidden
      />
      <div
        ref={panelRef}
        data-integral-modal
        role="dialog"
        /* Honest semantics: `aria-modal="true"` tells assistive tech the rest
           of the page is inert. With `allowAssistantDock` the dock is
           deliberately live (clickable AND in the Tab cycle above), so
           claiming modality would tell a screen-reader user the surface they
           can reach does not exist. Non-modal dialog (no aria-modal) is the
           accurate contract for the companion-surface case. */
        aria-modal={allowAssistantDock ? undefined : 'true'}
        aria-labelledby={title ? titleId : undefined}
        className={panelClass}
        tabIndex={-1}
      >
        {title && (
          /* Title bar is sticky in full-bleed mode so the user never
             loses the close button or the section name while scrolling
             through a long form on mobile. */
          <div
            className={[
              'flex items-center justify-between gap-3 px-4 sm:px-6 py-3 sm:py-3.5',
              'border-b border-[var(--panel-border)] bg-[var(--panel)]',
              fullBleed ? 'sticky top-0 z-10' : '',
            ].join(' ')}
          >
            <h2
              id={titleId}
              className="flex min-w-0 flex-1 items-center gap-2.5 text-[15px] font-medium tracking-[-0.011em] text-[var(--text)]"
            >
              {titleIcon ? (
                <IconWell size="xs" aria-hidden>
                  {titleIcon}
                </IconWell>
              ) : null}
              {typeof title === 'string' ? (
                <span className="truncate">{title}</span>
              ) : (
                /* ReactNode title — caller owns the composition (color
                   dot + text + badge, etc). The wrapping `<h2>` keeps
                   `aria-labelledby` valid. */
                title
              )}
            </h2>
            <div className="flex shrink-0 items-center gap-1">
              {headerActions}
              <button
                type="button"
                onClick={onClose}
                className="
                  -mr-1 inline-flex items-center justify-center
                  w-10 h-10 sm:w-8 sm:h-8 rounded-md
                  text-[var(--text-subtle)]
                  hover:text-[var(--text)] hover:bg-[var(--panel-2)]
                  transition-colors duration-fast
                  focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring-color)]
                "
                aria-label="Close"
              >
                <X size={18} strokeWidth={LINE_ICON_STROKE} />
              </button>
            </div>
          </div>
        )}
        {/* Body + companion column share one dialog surface: opening comments
            widens the SAME dialog rather than raising a second one beside it,
            so there is a single card on screen and the record stays in view.
            Below `sm` the dialog is already full-bleed, so the column is not
            rendered there. */}
        <div className="flex flex-1 min-h-0">
          <div className="overflow-y-auto flex-1 min-w-0 overscroll-contain">{children}</div>
          {sidePanel && (
            <div
              data-modal-side-panel
              className="hidden sm:flex sm:flex-col sm:shrink-0 sm:w-[var(--dialog-side-panel-w,360px)] border-l border-[var(--panel-border)]"
            >
              {sidePanel}
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}

/**
 * Modal.Body — canonical content slot inside a Modal. Owns the
 * standard `px-5 sm:px-6 py-5 space-y-4` chrome so every dialog body
 * has the same gutter and vertical rhythm. Pass `noPadding` for
 * full-bleed sub-surfaces (e.g. AttachmentViewer's pixel-perfect
 * canvas) and `noSpacing` when children manage their own gaps.
 */
export interface ModalBodyProps {
  children: ReactNode;
  className?: string;
  /** Skip the default `px-5 sm:px-6 py-5` gutter. */
  noPadding?: boolean;
  /** Skip the default `space-y-4` rhythm. */
  noSpacing?: boolean;
}

function ModalBody({
  children,
  className,
  noPadding,
  noSpacing,
}: ModalBodyProps) {
  return (
    <div
      className={[
        noPadding ? '' : 'px-5 sm:px-6 py-5',
        noSpacing ? '' : 'space-y-4',
        className ?? '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {children}
    </div>
  );
}

/**
 * Modal.Footer — canonical action rim inside a Modal. Pinned to the
 * bottom of the scroll container with `sticky bottom-0` so long forms
 * keep their primary action visible. Renders the standard top border,
 * panel background, and right-aligned button cluster. Pass `align`
 * to override the alignment for confirm-style dialogs that surface a
 * destructive action on the left.
 */
export interface ModalFooterProps {
  children: ReactNode;
  className?: string;
  /** Justification for the action cluster. Defaults to `end`. */
  align?: 'start' | 'between' | 'end';
}

function ModalFooter({
  children,
  className,
  align = 'end',
}: ModalFooterProps) {
  const justify =
    align === 'start'
      ? 'justify-start'
      : align === 'between'
        ? 'justify-between'
        : 'justify-end';
  return (
    <div
      className={[
        'sticky bottom-0 z-10',
        'flex flex-wrap items-center gap-2',
        justify,
        'border-t border-[var(--panel-border)] bg-[var(--panel)]',
        'px-5 sm:px-6 py-3.5',
        className ?? '',
      ].join(' ')}
    >
      {children}
    </div>
  );
}

Modal.Body = ModalBody;
Modal.Footer = ModalFooter;
