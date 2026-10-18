/**
 * IconButton — icon-only control primitive.
 *
 * The muted-icon-with-hover idiom (`text-[var(--text-muted)]` →
 * `hover:text-[var(--text)]` over a `hover:bg-[var(--panel-2)]` wash) was
 * hand-rolled at a dozen call sites: date-picker calendar/clear buttons,
 * calendar month/year steppers, dialog close buttons, drawer toggles. Each
 * copy carried the same four literals, which is both drift the UI guard
 * flags and a real single-source-of-truth problem — the hover tone could
 * not be changed in one place.
 *
 * `<Text>` cannot express this: the hover variants apply to the *button*,
 * not to a text node, so the tone has to live on the interactive element.
 * That is exactly what a Layer-1 primitive is for.
 *
 * See `.planning/ui-templating/adr-frontend-layering.md` (IconButton is a
 * Layer-1 primitive; it consumes only Layer-0 tokens).
 */

import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';

/** Hit-area size. `sm` for dense inline controls, `md` for chrome. */
export type IconButtonSize = 'sm' | 'md';

/** Resting tone. Both lift to `--text` on hover. */
export type IconButtonTone = 'muted' | 'subtle';

/** Corner treatment. `circle` matches the composer's round actions. */
export type IconButtonShape = 'rounded' | 'circle';

const SIZE_CLASSES: Record<IconButtonSize, string> = {
  sm: 'p-1',
  md: 'h-8 w-8',
};

const SHAPE_CLASSES: Record<IconButtonShape, string> = {
  rounded: 'rounded-[var(--radius-input)]',
  circle: 'rounded-full',
};

const TONE_CLASSES: Record<IconButtonTone, string> = {
  muted: 'text-[var(--text-muted)]',
  subtle: 'text-[var(--text-subtle)]',
};

const RESTING_HOVER = 'hover:bg-[var(--panel-2)] hover:text-[var(--text)]';
const PRESSED_CLASSES =
  'bg-[var(--brand-accent-soft)] text-[var(--brand-accent)] hover:bg-[var(--brand-accent-soft)]';

export interface IconButtonProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'className' | 'children'> {
  /** Accessible name. Required — an icon-only control has no text to fall
   *  back on, so omitting it leaves the button unlabelled to a screen
   *  reader. Applied as `aria-label`. */
  label: string;
  /** The icon. Pass it `aria-hidden` — `label` is the accessible name. */
  children: ReactNode;
  /** Default: `sm`. */
  size?: IconButtonSize;
  /** Default: `muted`. */
  tone?: IconButtonTone;
  /** Default: `rounded`. */
  shape?: IconButtonShape;
  /**
   * Makes the button a toggle: sets `aria-pressed`, and while `true` shows
   * the active (accent) treatment instead of the resting tone.
   */
  pressed?: boolean;
  /**
   * Layout-positioning classes only — `shrink-0`, `self-center`, margins.
   * NEVER color, background, or radius utilities; those are the props above.
   */
  className?: string;
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(
  function IconButton(
    {
      label,
      children,
      size = 'sm',
      tone = 'muted',
      shape = 'rounded',
      pressed,
      className,
      type,
      ...rest
    },
    ref,
  ) {
    const classes = [
      'inline-flex shrink-0 items-center justify-center',
      SIZE_CLASSES[size],
      SHAPE_CLASSES[shape],
      pressed ? PRESSED_CLASSES : `${TONE_CLASSES[tone]} ${RESTING_HOVER}`,
      'transition-colors duration-fast',
      'disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:bg-transparent',
      'focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring-color)]',
      className ?? '',
    ]
      .filter(Boolean)
      .join(' ');

    return (
      <button
        ref={ref}
        // Default to `button`: inside a form, an unset type submits.
        type={type ?? 'button'}
        aria-label={label}
        aria-pressed={pressed}
        className={classes}
        {...rest}
      >
        {children}
      </button>
    );
  },
);
