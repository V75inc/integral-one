/**
 * Input — text input primitive.
 *
 * Wraps `<input>` with the canonical `app-input` styling (defined in
 * `frontend/src/index.css`). Replaces raw `<input class="app-input">`
 * usage across feature code — pairs naturally with `<Field>` for
 * label / hint / error composition.
 *
 * Layer: Primitive (Layer 1).
 *
 * Usage:
 *   <Field label="Name" htmlFor="name">
 *     <Input id="name" value={name} onChange={...} />
 *   </Field>
 *
 *   <Input size="sm" invalid placeholder="Search…" />
 *
 * All standard `<input>` props (type, value, onChange, placeholder,
 * disabled, name, autoComplete, etc) are forwarded. Use the typed
 * `size`/`invalid`/`monospace` props for variant control rather than
 * passing utility classes via `className`.
 */

import { forwardRef, type InputHTMLAttributes } from 'react';

export type InputSize = 'sm' | 'md' | 'lg';

const SIZE_CLASSES: Record<InputSize, string> = {
  sm: 'h-8 text-xs',
  md: '', // default — `app-input` baseline (py-2 + text-sm)
  lg: 'h-11 text-base',
};

export interface InputProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> {
  /** Vertical size + text size. Default: `md`. */
  size?: InputSize;
  /** Mark the input as invalid — wraps in danger-tinted border + ring. */
  invalid?: boolean;
  /** Render in monospace font (keys, hashes, IDs). */
  monospace?: boolean;
  /**
   * Layout-positioning classes only (max-width caps inside flex cells,
   * grid placement). NEVER size/spacing/color — use typed props.
   */
  className?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { size = 'md', invalid = false, monospace = false, className, type = 'text', ...rest },
  ref,
) {
  const classes = [
    'app-input',
    SIZE_CLASSES[size],
    invalid
      ? 'border-[var(--danger-fg)] focus:shadow-[0_0_0_2px_var(--danger-bg)]'
      : '',
    monospace ? 'font-mono' : '',
    className ?? '',
  ]
    .filter(Boolean)
    .join(' ');
  return (
    <input
      ref={ref}
      type={type}
      className={classes}
      aria-invalid={invalid || undefined}
      {...rest}
    />
  );
});
