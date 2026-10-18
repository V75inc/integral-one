import { useEffect, useRef, type KeyboardEvent, type ReactNode } from 'react';

/**
 * ViewTabs — horizontal tab strip for switching between Track views
 * (Feed, Kanban, Table, Calendar, Gallery) and similar bounded sets.
 *
 * Visually distinct from SegmentedControl: ViewTabs render as a borderless
 * row of text-buttons with an underline accent on the active tab. Use this
 * when tabs sit at the top of a content section. Use SegmentedControl when
 * the selector is inline within toolbars.
 */
export interface ViewTabOption<V extends string = string> {
  value: V;
  label: ReactNode;
  icon?: ReactNode;
  /** Optional small count badge rendered after the label. */
  count?: number | null;
  disabled?: boolean;
  title?: string;
}

interface ViewTabsProps<V extends string = string> {
  options: ViewTabOption<V>[];
  value: V;
  onChange: (next: V) => void;
  className?: string;
  ariaLabel?: string;
  /** Right-anchored slot for action buttons (e.g. "+ New entry"). */
  actions?: ReactNode;
  /** When true, omit the built-in ``border-b`` on the tab row. Use
   *  when a parent element supplies a full-bleed divider (Notion-style
   *  page rule) that the tabs sit on top of. */
  noBorder?: boolean;
  /**
   * ``sm`` tightens padding, type and the count badge for narrow hosts —
   * the entry dialog's ~360px companion column, where three default-size
   * tabs measure 465px and the last one scrolls out of sight. Same
   * underline idiom, less width.
   */
  size?: 'md' | 'sm';
}

export function ViewTabs<V extends string = string>({
  options,
  value,
  onChange,
  className = '',
  ariaLabel,
  actions,
  noBorder = false,
  size = 'md',
}: ViewTabsProps<V>) {
  const compact = size === 'sm';
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const scrollerRef = useRef<HTMLDivElement | null>(null);

  /* When the strip is narrow enough to scroll (a dialog's companion column
     fits ~3 labelled tabs), the selected tab must still be visible — an
     active tab parked off-screen leaves the user with no idea where they
     are. Only scrolls the strip itself, never the page. */
  useEffect(() => {
    const el = tabRefs.current[value];
    const scroller = scrollerRef.current;
    if (!el || !scroller) return;
    if (scroller.scrollWidth <= scroller.clientWidth) return;
    const left = el.offsetLeft;
    const right = left + el.offsetWidth;
    if (left < scroller.scrollLeft) scroller.scrollTo({ left, behavior: 'smooth' });
    else if (right > scroller.scrollLeft + scroller.clientWidth) {
      scroller.scrollTo({ left: right - scroller.clientWidth, behavior: 'smooth' });
    }
  }, [value]);

  /**
   * ARIA tab keyboard contract: the strip is ONE tab stop, and
   * Left/Right/Home/End move between tabs inside it. Without this the role
   * lies — a screen-reader user is told "tab" but gets plain buttons, and a
   * keyboard user has to Tab through every option to pass the strip.
   * Disabled options are skipped rather than trapping the roving cursor.
   */
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const keys = ['ArrowLeft', 'ArrowRight', 'Home', 'End'];
    if (!keys.includes(e.key)) return;
    const selectable = options.filter(o => !o.disabled);
    if (selectable.length === 0) return;
    const current = selectable.findIndex(o => o.value === value);
    let nextIndex: number;
    if (e.key === 'Home') nextIndex = 0;
    else if (e.key === 'End') nextIndex = selectable.length - 1;
    else {
      const delta = e.key === 'ArrowRight' ? 1 : -1;
      const from = current === -1 ? 0 : current;
      nextIndex = (from + delta + selectable.length) % selectable.length;
    }
    const next = selectable[nextIndex];
    if (!next || next.value === value) return;
    e.preventDefault();
    onChange(next.value);
    // Follow focus, so the roving cursor and the selection stay together.
    tabRefs.current[next.value]?.focus();
  };

  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      onKeyDown={onKeyDown}
      className={`flex items-end justify-between gap-3 ${noBorder ? '' : 'border-b border-[var(--panel-border)]'} ${className}`}
    >
      <div
        ref={scrollerRef}
        className={`flex items-end overflow-x-auto -mb-px ${compact ? 'gap-1' : 'gap-2'}`}
      >
        {options.map((o) => {
          const active = o.value === value;
          return (
            <button
              key={o.value}
              ref={el => {
                tabRefs.current[o.value] = el;
              }}
              role="tab"
              aria-selected={active}
              // Roving tabindex — only the active tab is in the page's Tab
              // order; the rest are reachable via the arrow keys above.
              tabIndex={active ? 0 : -1}
              disabled={o.disabled}
              type="button"
              title={o.title}
              onClick={() => !o.disabled && onChange(o.value)}
              className={[
                'inline-flex items-center font-medium whitespace-nowrap',
                compact
                  ? 'gap-1 px-2 py-2 text-xs'
                  : 'gap-1.5 px-4 py-3 text-sm',
                'border-b-2 transition-colors duration-fast',
                active
                  ? 'border-[var(--brand-accent)] text-[var(--text)]'
                  : 'border-transparent text-[var(--text-muted)] hover:text-[var(--text)]',
                o.disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer',
              ].join(' ')}
            >
              {o.icon && <span aria-hidden>{o.icon}</span>}
              <span>{o.label}</span>
              {typeof o.count === 'number' && (
                <span
                  className={[
                    'ml-1 inline-flex items-center justify-center rounded-full',
                    'bg-[var(--badge-muted-bg)] text-[var(--badge-muted-fg)] font-semibold leading-none tabular-nums',
                    compact
                      ? 'min-w-[1rem] h-4 px-1 text-[11px]'
                      : 'min-w-[1.25rem] h-5 px-1.5 text-[13px]',
                  ].join(' ')}
                >
                  {o.count}
                </span>
              )}
            </button>
          );
        })}
      </div>
      {actions && <div className="pb-2 flex items-center gap-2">{actions}</div>}
    </div>
  );
}
