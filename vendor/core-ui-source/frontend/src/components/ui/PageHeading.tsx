import type { ReactNode } from 'react';

/**
 * PageHeading — the editorial display-title primitive used at the top
 * of every major page (Mission Control, Feed, Tracks, Apps, etc.).
 *
 * Shape on desktop:
 *   ┃ Display title (36px)
 *
 * Shape on mobile:
 *   ▎ Display title (28px)
 *
 * Renders a vertical bar marker (the entity's accent color, defaulting
 * to --brand-accent) followed by the title text. For tracks and apps,
 * this bar plus list-row dots/bullets are the only surfaces that
 * should reflect a custom identity color. Sizing scales:
 *
 *   < sm  : 28px font  / 24px bar height / 4px bar width
 *   sm    : 32px font  / 24px bar height / 4px bar width
 *   md+   : 36px font  / 28px bar height / 4px bar width
 *
 * The wrapper sets `flex-1 min-w-0` unconditionally. On a block-level
 * parent these flex properties are inert; on a flex-row parent (the
 * TrackDetail / AppDetail title rows that sit alongside action
 * clusters) they let the heading shrink and truncate. Callers do not
 * need to know which case applies.
 */
export interface PageHeadingProps {
  /** The visible title text. Can be a string or a richer node (e.g. with badges). */
  children: ReactNode;
  /** Accent color for the identity bar. Defaults to `var(--brand-accent)`. */
  accentColor?: string;
  /** Stable accessible label for the bar (e.g. the track/app name). */
  accentLabel?: string;
  /** Optional id forwarded to the `<h1>` for aria-labelledby links. */
  id?: string;
  /** App identity may replace the default accent bar. */
  icon?: ReactNode;
  /** Optional className appended to the `<h1>` for one-off tweaks. */
  className?: string;
}

export function PageHeading({
  children,
  accentColor,
  icon,
  accentLabel,
  id,
  className,
}: PageHeadingProps) {
  return (
    <h1
      id={id}
      className={[
        // Responsive display sizing — the 36px reference design at md+,
        // stepping down through sm and base widths so the title never
        // overflows a 360px viewport.
        'text-[28px] sm:text-[32px] md:text-[36px]',
        'font-semibold tracking-[-0.035em] text-[var(--text)]',
        // Tighter leading on mobile keeps long titles from blowing up
        // the header vertically when they wrap.
        'leading-[1.1] md:leading-[1.15] pb-1',
        // Bar marker and label sit on one row; gap scales with the
        // surrounding type so the bar reads as part of the title.
        'flex items-center gap-3',
        // Always declare flex-1 + min-w-0 so the heading shrinks
        // gracefully when it sits inside a flex-row alongside action
        // buttons. In a block parent the flex props are inert.
        //
        // `basis-96` is what keeps a title readable, and it works with the
        // header row's `flex-wrap`: the row/column switch is keyed on the
        // VIEWPORT while the container can be much narrower — the assistant
        // dock insets it by `--assistant-dock-w`. Asking for 24rem means that
        // when the container cannot seat the title AND the action cluster, the
        // actions wrap to their own line instead of squeezing the title; when
        // there is room, `flex-1` still lets the title grow past 24rem.
        //
        // A bare `min-width` floor was not enough: 10rem still fit alongside
        // the actions in a dock-narrowed 622px header, so nothing wrapped and
        // "Product Pipeline" clipped to "Product Pi…" in the 308px left over.
        // Below `sm` the parent is a column, where this does nothing useful.
        'min-w-0 flex-1 sm:basis-96',
        className ?? '',
      ].join(' ')}
    >
      {icon ?? <span
        aria-hidden
        title={accentLabel}
        /* Bar dimensions tuned to the cap-line of the title at each
           breakpoint. Inline style for width because the height already
           scales with Tailwind classes; one inline declaration beats
           three arbitrary-value classes. */
        className="block shrink-0 rounded-[2px] h-6 sm:h-6 md:h-7"
        style={{
          width: 4,
          backgroundColor: accentColor || 'var(--brand-accent)',
        }}
      />}
      <span className="min-w-0 break-words sm:truncate">{children}</span>
    </h1>
  );
}
