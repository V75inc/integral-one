import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Check, MoreHorizontal } from 'lucide-react';
import { Button } from './Button';
import { LINE_ICON_STROKE } from './IconWell';

export interface KebabMenuItem {
  /** Stable key. */
  key: string;
  /** Visible label. */
  label: string;
  description?: string;
  /** Radio choice when this menu selects one active option. */
  selected?: boolean;
  /** Optional leading glyph (lucide icon). */
  icon?: ReactNode;
  /** Action to run on click. */
  onClick: () => void;
  /** Danger tone — uses danger fg/bg tokens. */
  danger?: boolean;
  /** Disable the item. */
  disabled?: boolean;
  /** Render a divider above this item. */
  dividerAbove?: boolean;
}

interface KebabMenuProps {
  menuTitle?: string;
  menuCaption?: string;
  align?: 'start' | 'end';
  /** Render outside a scroll container so the menu cannot resize its content. */
  portal?: boolean;
  items: KebabMenuItem[];
  /** Accessible label for the trigger button. */
  ariaLabel?: string;
  /** Match the size of sibling Button size="sm" so the trigger sits in
   *  the same baseline as inline action buttons. */
  size?: 'sm' | 'md';
  disabled?: boolean;
  title?: string;
  icon?: ReactNode;
}

/** Three-dot overflow menu for secondary / destructive actions.
 *
 *  Pattern lifted from `EntryCard.tsx` owner-actions menu (showMenu state +
 *  outside-click + Escape close), repackaged as a reusable primitive so
 *  detail pages don't reimplement the same plumbing per surface. */
export function KebabMenu({
  items,
  ariaLabel = 'More actions',
  size = 'sm',
  icon,
  disabled = false,
  title,
  menuTitle,
  menuCaption,
  align = 'end',
  portal = false,
}: KebabMenuProps) {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [menuShift, setMenuShift] = useState(0);
  const [portalPosition, setPortalPosition] = useState<{ top: number; left: number } | null>(null);
  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const rect = menuRef.current?.getBoundingClientRect();
      const anchor = wrapperRef.current?.getBoundingClientRect();
      if (!rect || !anchor || !rect.width) return;
      if (portal) {
        const baseLeft = align === 'start' ? anchor.left : anchor.right - rect.width;
        const left = Math.max(16, Math.min(baseLeft, window.innerWidth - 16 - rect.width));
        const verticalAnchor = wrapperRef.current?.closest('form')?.getBoundingClientRect() ?? anchor;
        const below = verticalAnchor.bottom + 8;
        const top = below + rect.height <= window.innerHeight - 8
          ? below
          : Math.max(8, verticalAnchor.top - 8 - rect.height);
        setPortalPosition({ top, left });
        return;
      }
      const baseLeft = align === 'start' ? anchor.left : anchor.right - rect.width;
      const baseRight = baseLeft + rect.width;
      setMenuShift(Math.max(16 - baseLeft, Math.min(0, window.innerWidth - 16 - baseRight)));
    };
    place();
    window.addEventListener('resize', place);
    if (portal) document.addEventListener('scroll', place, true);
    return () => {
      window.removeEventListener('resize', place);
      if (portal) document.removeEventListener('scroll', place, true);
    };
  }, [open, align, portal]);

  useEffect(() => {
    if (!open) return;
    // A portalled menu is initially hidden until layout determines its position.
    // Focus only after it is visible; focusing a hidden button is ignored by browsers.
    if ((!portal || portalPosition) && !menuRef.current?.contains(document.activeElement)) {
      menuRef.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus();
    }
    const onPointer = (e: PointerEvent) => {
      const t = e.target as HTMLElement | null;
      if (!t || (!wrapperRef.current?.contains(t) && !menuRef.current?.contains(t))) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof Node && (menuRef.current?.contains(e.target) || wrapperRef.current?.contains(e.target)) && ['ArrowDown', 'ArrowUp', 'Home', 'End', 'Tab'].includes(e.key)) {
        e.preventDefault();
        e.stopImmediatePropagation();
        if (e.key === 'Tab') {
          setOpen(false);
          wrapperRef.current?.querySelector<HTMLButtonElement>('button')?.focus();
          return;
        }
        const buttons = Array.from(menuRef.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? []);
        if (!buttons.length) return;
        const current = buttons.indexOf(document.activeElement as HTMLButtonElement);
        const next = e.key === 'Home' ? 0 : e.key === 'End' ? buttons.length - 1 :
          (current + (e.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length;
        buttons[next]?.focus();
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopImmediatePropagation();
        setOpen(false);
        wrapperRef.current?.querySelector<HTMLButtonElement>('button')?.focus();
      }
    };
    document.addEventListener('pointerdown', onPointer);
    window.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      window.removeEventListener('keydown', onKey, true);
    };
  }, [open, portal, portalPosition]);

  // Use the shared Button primitive as the trigger so the kebab inherits
  // the exact same height/padding/border/font model as neighbouring
  // outline buttons in the action row. Override horizontal padding to
  // ``px-2`` so an icon-only trigger reads as roughly square instead of
  // pill-shaped (Button sm default is ``px-3``).
  const menu = open ? (
    <div
      ref={menuRef}
      style={portal
        ? {
            position: 'fixed',
            top: portalPosition?.top ?? 0,
            left: portalPosition?.left ?? 0,
            visibility: portalPosition ? 'visible' : 'hidden',
          }
        : { transform: `translateX(${menuShift}px)` }}
      role="menu"
      className={`${portal ? '' : `${align === 'start' ? 'left-0' : 'right-0'} absolute top-full mt-2`} ${portal ? 'z-popover' : 'z-30'} ${menuTitle ? 'w-72 p-2' : 'min-w-[200px] py-1'} max-w-[calc(100vw-2rem)] max-h-[min(60vh,28rem)] overflow-y-auto rounded-[var(--radius-card)] border border-[var(--panel-border)] bg-[var(--panel)] shadow-[var(--shadow-pop)] text-left animate-fade-in`}
      onClick={e => e.stopPropagation()}
    >
      {menuTitle && <div className="px-3 pb-3 pt-2">
        <p className="text-sm font-semibold text-[var(--text)]">{menuTitle}</p>
        {menuCaption && <p className="mt-1 text-xs leading-relaxed text-[var(--text-muted)]">{menuCaption}</p>}
      </div>}
      {items.map(item => (
        <div key={item.key}>
          {item.dividerAbove ? (
            <div className="my-1 h-px bg-[var(--panel-border)]" aria-hidden />
          ) : null}
          <button
            type="button"
            role={item.selected === undefined ? "menuitem" : "menuitemradio"}
            aria-checked={item.selected}
            disabled={item.disabled}
            title={item.description}
            onClick={() => {
              if (item.disabled) return;
              setOpen(false);
              wrapperRef.current?.querySelector<HTMLButtonElement>("button")?.focus();
              item.onClick();
            }}
            className={[
              'flex items-center gap-2 w-full px-3 py-2 text-sm text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring-color)]',
              item.description ? 'rounded-[var(--radius-input)] my-1' : '',
              item.disabled
                ? 'opacity-50 cursor-not-allowed text-[var(--text-muted)]'
                : item.danger
                  ? 'text-[var(--danger-fg)] hover:bg-[var(--danger-bg)]'
                  : 'text-[var(--text)] hover:bg-[var(--panel-2)]',
            ].join(' ')}
          >
            {item.icon ? (
              <span className="shrink-0 inline-flex items-center justify-center">
                {item.icon}
              </span>
            ) : null}
            <span className="min-w-0">
              <span className={item.description ? 'block font-medium' : 'block truncate'}>{item.label}</span>
              {item.description && <span className="mt-1 block break-words text-xs leading-relaxed text-[var(--text-muted)] line-clamp-2">{item.description}</span>}
            </span>
            {item.selected && <Check size={16} strokeWidth={LINE_ICON_STROKE} className="ml-auto shrink-0" aria-hidden />}
          </button>
        </div>
      ))}
    </div>
  ) : null;

  return (
    <div className="relative" ref={wrapperRef}>
      <Button
        variant="outline"
        size={size}
        disabled={disabled}
        title={title}
        onClick={() => setOpen(s => !s)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={ariaLabel}
        /* ``!px-2`` keeps the icon-only trigger near-square (Button sm
           defaults to ``px-3`` for label width). Icon-only Buttons render
           no text run, so the line-box that normally sets ``text-sm``
           line-height (20px) is absent and the content collapses to the
           icon height (16px) — leaving the trigger ~4px shorter than
           sibling labelled buttons. ``min-h-[N]`` restores the height to
           match: sm = 34px (line-height 20 + py-1.5 12 + border 2), md =
           38px (line-height 20 + py-2 16 + border 2). */
        className={[
          '!p-0 text-[var(--text-muted)] hover:text-[var(--text)]',
          /* Square trigger sized to the labelled-button height:
               sm = 36×36 (matches Button sm outline 36px)
               md = 40×40 (matches Button md outline 40px)
             ``!p-0`` overrides Button's default ``px-3 py-1.5`` so the
             explicit width/height drive geometry and the icon centers via
             Button's intrinsic ``items-center justify-center``. */
          size === 'md' ? '!h-10 !w-10' : '!h-9 !w-9',
        ].join(' ')}
        icon={icon ?? <MoreHorizontal size={16} strokeWidth={LINE_ICON_STROKE} />}
      />
      {portal && menu ? createPortal(menu, document.body) : menu}
    </div>
  );
}
