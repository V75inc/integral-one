import type { ReactElement, ReactNode } from 'react';

type HoverTooltipPlacement = 'top' | 'bottom' | 'right';

const PLACEMENT_CLASS: Record<HoverTooltipPlacement, string> = {
  top: 'bottom-full left-1/2 -translate-x-1/2 mb-1.5',
  bottom: 'top-full left-1/2 -translate-x-1/2 mt-1.5',
  right: 'left-full top-1/2 -translate-y-1/2 ml-2',
};

interface HoverTooltipProps {
  label: ReactNode;
  children: ReactElement;
  placement?: HoverTooltipPlacement;
}

/** Small inverse popover on hover/focus — matches collapsed sidebar nav tooltips. */
export function HoverTooltip({
  label,
  children,
  placement = 'bottom',
}: HoverTooltipProps) {
  return (
    <span className="group/hovertip relative inline-flex">
      {children}
      <span
        role="tooltip"
        aria-hidden
        className={[
          'pointer-events-none absolute z-50',
          PLACEMENT_CLASS[placement],
          'px-2.5 py-1.5 rounded-md',
          'bg-[var(--text)] text-[var(--bg)]',
          'shadow-[var(--shadow-pop)]',
          'text-xs font-medium whitespace-nowrap',
          'opacity-0 group-hover/hovertip:opacity-100 group-focus-within/hovertip:opacity-100',
          'transition-opacity duration-fast',
        ].join(' ')}
      >
        {label}
      </span>
    </span>
  );
}
