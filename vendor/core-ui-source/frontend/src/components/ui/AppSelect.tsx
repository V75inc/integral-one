import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown } from 'lucide-react';
import { LINE_ICON_STROKE } from './IconWell';

export type AppSelectOption = {
  value: string;
  label: ReactNode;
  /** Closed trigger text; defaults to `label` when omitted */
  triggerLabel?: ReactNode;
  /** Muted second line in the dropdown only */
  description?: ReactNode;
  disabled?: boolean;
};

export type AppSelectProps = {
  value: string;
  onValueChange: (value: string) => void;
  options: AppSelectOption[];
  id?: string;
  'aria-label'?: string;
  disabled?: boolean;
  /** `field` matches `.app-input`; `pill` matches compact composer controls */
  variant?: 'field' | 'pill';
  className?: string;
  /** When `value` is missing from `options`, trigger shows this (or raw `value`) */
  placeholder?: string;
  /** Opt-in type-ahead: a search box inside the open list filters the options. */
  searchable?: boolean;
  onSearchChange?: (query: string) => void;
};

export function AppSelect({
  value,
  onValueChange,
  options,
  id,
  'aria-label': ariaLabel,
  disabled,
  variant = 'field',
  className = '',
  placeholder,
  searchable = false,
  onSearchChange,
}: AppSelectProps) {
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<{
    triggerTop: number;
    triggerBottom: number;
    left: number;
    minWidth: number;
    maxWidth: number;
    maxH: number;
    placement: 'up' | 'down';
  } | null>(null);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const triggerRef = useRef<HTMLButtonElement | HTMLInputElement | null>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const listboxId = useId();

  const selected = options.find(o => o.value === value);
  /** Match other composer fields: empty value uses muted placeholder tone. */
  const emptySelection = value === '';
  const display: ReactNode = selected
    ? (selected.triggerLabel !== undefined ? selected.triggerLabel : selected.label)
    : placeholder !== undefined
      ? placeholder
      : value || '\u00a0';

  const updateCoords = useCallback(() => {
    const el = triggerRef.current;
    if (!el || typeof window === 'undefined') return;
    const r = el.getBoundingClientRect();
    const pad = 8;
    const below = window.innerHeight - r.bottom - pad;
    const above = r.top - pad;
    // Open upward when there isn't room below (and more room above) so the list
    // never runs off the bottom of the viewport.
    const placement: 'up' | 'down' =
      below < 180 && above > below ? 'up' : 'down';
    // Size to the available space — no floor, so it can't overflow the viewport.
    const maxH = Math.min(320, Math.max(0, placement === 'up' ? above : below));
    const maxWidth = Math.max(0, window.innerWidth - 2 * pad);
    setCoords({
      triggerTop: r.top,
      triggerBottom: r.bottom,
      left: r.left,
      minWidth: r.width,
      maxWidth,
      maxH,
      placement,
    });
  }, []);

  useLayoutEffect(() => {
    if (!open) {
      setCoords(null);
      return;
    }
    updateCoords();
    window.addEventListener('scroll', updateCoords, true);
    window.addEventListener('resize', updateCoords);
    return () => {
      window.removeEventListener('scroll', updateCoords, true);
      window.removeEventListener('resize', updateCoords);
    };
  }, [open, updateCoords]);

  /** Keep the menu inside the viewport horizontally once intrinsic width is known. */
  useLayoutEffect(() => {
    if (!open || !coords) return;
    const list = listRef.current;
    if (!list) return;
    const pad = 8;
    const rect = list.getBoundingClientRect();
    let left = coords.left;
    if (rect.right > window.innerWidth - pad) {
      left = Math.max(pad, window.innerWidth - pad - rect.width);
    }
    if (rect.left < pad) {
      left = pad;
    }
    if (Math.abs(left - coords.left) > 0.5) {
      setCoords(c => (c ? { ...c, left } : null));
    }
  }, [open, coords]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onMouseDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (triggerRef.current?.contains(t) || listRef.current?.contains(t)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', onMouseDown);
    return () => document.removeEventListener('mousedown', onMouseDown);
  }, [open]);

  const fieldTrigger =
    'flex w-full min-w-0 items-center justify-between gap-2 text-left cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed';
  const pillTrigger =
    'flex min-w-0 max-w-full items-center justify-between gap-2 rounded-md border border-[var(--panel-border)] bg-[var(--panel-2)] px-3 py-1.5 pr-2 text-left text-sm text-[var(--text)] cursor-pointer outline-none transition focus:ring-2 focus:ring-[var(--focus-ring-color)] disabled:opacity-50 disabled:cursor-not-allowed';

  const filteredOptions = useMemo(() => {
    if (!searchable || !query.trim()) return options;
    const q = query.trim().toLowerCase();
    return options.filter(opt => {
      const label = typeof opt.label === 'string' ? opt.label : opt.value;
      return (
        String(opt.value).toLowerCase().includes(q) ||
        label.toLowerCase().includes(q)
      );
    });
  }, [options, query, searchable]);

  function handleSearchKeyDown(e: ReactKeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Escape') {
      if (open) {
        e.preventDefault();
        setOpen(false);
      }
      return;
    }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!open) setOpen(true);
      setActiveIndex(i =>
        e.key === 'ArrowDown'
          ? Math.min(i + 1, Math.max(0, filteredOptions.length - 1))
          : Math.max(i - 1, 0)
      );
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      const opt = filteredOptions[activeIndex];
      if (opt && !opt.disabled) {
        onValueChange(opt.value);
        setOpen(false);
        triggerRef.current?.focus();
      }
    }
  }

  const list = open && coords && (
    <ul
      ref={listRef}
      id={listboxId}
      role="listbox"
      className="fixed z-popover box-border overflow-y-auto overflow-x-hidden rounded-[var(--radius-input)] border border-[var(--panel-border)] bg-[var(--panel)] py-1 shadow-lg outline-none"
      style={{
        ...(coords.placement === 'up'
          ? { bottom: window.innerHeight - coords.triggerTop + 4 }
          : { top: coords.triggerBottom + 4 }),
        left: coords.left,
        minWidth: coords.minWidth,
        maxWidth: coords.maxWidth,
        width: 'max-content',
        maxHeight: coords.maxH,
      }}
    >
      {filteredOptions.map((opt, idx) => {
        const isSelected = opt.value === value;
        const isActive = searchable && idx === activeIndex;
        const primary =
          opt.triggerLabel !== undefined ? opt.triggerLabel : opt.label;
        return (
          <li key={opt.value} role="presentation">
            <button
              type="button"
              role="option"
              aria-selected={isSelected}
              data-active={isActive || undefined}
              disabled={opt.disabled}
              className={`flex w-full min-w-0 max-w-full items-start gap-2 px-3 py-2.5 text-left transition-colors disabled:opacity-40 ${
                isSelected
                  ? 'bg-[var(--nav-active-bg)] text-[var(--nav-active-fg)]'
                  : isActive
                    ? 'bg-[var(--panel-2)]'
                    : 'hover:bg-[var(--panel-2)]'
              }`}
              onClick={() => {
                if (opt.disabled) return;
                onValueChange(opt.value);
                setOpen(false);
                triggerRef.current?.focus();
              }}
            >
              <span className="min-w-0 max-w-full flex-1 flex flex-col items-start gap-0.5">
                <span className="w-full whitespace-normal break-words text-sm">{primary}</span>
                {opt.description ? (
                  <span
                    className={`w-full whitespace-normal break-words text-xs ${
                      isSelected ? 'opacity-80' : 'text-[var(--text-muted)]'
                    }`}
                  >
                    {opt.description}
                  </span>
                ) : null}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );

  const selectedLabel = selected
    ? typeof (selected.triggerLabel ?? selected.label) === 'string'
      ? String(selected.triggerLabel ?? selected.label)
      : String(selected.value)
    : '';

  return (
    <div className="min-w-0">
      {searchable ? (
        <div className="relative">
          <input
            ref={el => {
              triggerRef.current = el;
            }}
            id={id}
            type="text"
            role="combobox"
            aria-label={ariaLabel}
            aria-expanded={open}
            aria-haspopup="listbox"
            aria-controls={listboxId}
            aria-autocomplete="list"
            autoComplete="off"
            disabled={disabled}
            value={open ? query : selectedLabel}
            placeholder={open ? selectedLabel || placeholder : placeholder}
            onFocus={() => {
              if (disabled || open) return;
              setQuery('');
              setActiveIndex(0);
              setOpen(true);
            }}
            onClick={() => {
              if (disabled) return;
              if (!open) {
                setQuery('');
                setActiveIndex(0);
              }
              setOpen(true);
            }}
            onChange={e => {
              setQuery(e.target.value);
              onSearchChange?.(e.target.value);
              setActiveIndex(0);
              if (!open) setOpen(true);
            }}
            onKeyDown={handleSearchKeyDown}
            className={`${variant === 'field' ? fieldTrigger : pillTrigger} ${className} pr-7`}
          />
          <ChevronDown
            size={variant === 'pill' ? 14 : 16}
            strokeWidth={LINE_ICON_STROKE}
            className={`pointer-events-none absolute right-1 top-1/2 -translate-y-1/2 shrink-0 text-[var(--text-muted)] transition-transform ${open ? 'rotate-180' : ''}`}
            aria-hidden
          />
        </div>
      ) : (
        <button
          ref={el => {
            triggerRef.current = el;
          }}
          type="button"
          id={id}
          aria-label={ariaLabel}
          aria-expanded={open}
          aria-haspopup="listbox"
          aria-controls={listboxId}
          disabled={disabled}
          className={`${variant === 'field' ? fieldTrigger : pillTrigger} ${className}`}
          onClick={() => {
            if (disabled) return;
            // Reset the type-ahead filter each time the list opens.
            if (!open) {
              setQuery('');
              setActiveIndex(0);
            }
            setOpen(o => !o);
          }}
        >
          <span
            className={`min-w-0 flex-1 truncate ${
              emptySelection ? 'text-[var(--text-muted)]' : 'text-[var(--text)]'
            }`}
          >
            {display}
          </span>
          <ChevronDown
            size={variant === 'pill' ? 14 : 16}
            strokeWidth={LINE_ICON_STROKE}
            className={`shrink-0 text-[var(--text-muted)] transition-transform ${open ? 'rotate-180' : ''}`}
            aria-hidden
          />
        </button>
      )}
      {list ? createPortal(list, document.body) : null}
    </div>
  );
}
