/**
 * Select — native `<select>` primitive.
 *
 * Wraps `<select>` with the canonical `app-input` styling and inset caret. Use inside
 * `<Field>` for label + hint composition; pass `<option>` children for
 * the option list. Mirrors `<Input>`/`<Textarea>` size/invalid props.
 *
 * NOTE: this is the NATIVE select — for searchable / multi-select /
 * custom-option-rendering, a dedicated headless component is required
 * (deferred to a future Phase 3-C slice).
 *
 * Layer: Primitive (Layer 1).
 *
 * Usage:
 *   <Field label="Type" htmlFor="t">
 *     <Select id="t" value={type} onChange={e => setType(e.target.value)}>
 *       <option value="a">A</option>
 *       <option value="b">B</option>
 *     </Select>
 *   </Field>
 */

import { forwardRef, type SelectHTMLAttributes } from 'react';

export type SelectSize = 'sm' | 'md' | 'lg';

const SIZE_CLASSES: Record<SelectSize, string> = {
  sm: 'h-10 text-xs',
  md: '',
  lg: 'h-11 text-base',
};

export interface SelectProps
  extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'size'> {
  size?: SelectSize;
  invalid?: boolean;
  /**
   * Layout-positioning classes only (max-width caps, grid placement).
   * NEVER size/spacing/color — use typed props.
   */
  className?: string;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { size = 'md', invalid = false, className, children, ...rest },
  ref,
) {
  const classes = [
    'app-input',
    SIZE_CLASSES[size],
    invalid
      ? 'border-[var(--danger-fg)] focus:shadow-[0_0_0_2px_var(--danger-bg)]'
      : '',
    className ?? '',
  ]
    .filter(Boolean)
    .join(' ');
  return (
    <select
      ref={ref}
      className={classes}
      aria-invalid={invalid || undefined}
      {...rest}
    >
      {children}
    </select>
  );
});
