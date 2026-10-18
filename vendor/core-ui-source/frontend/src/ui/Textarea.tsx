/**
 * Textarea — multi-line text input primitive.
 *
 * Wraps `<textarea>` with the canonical `app-input` styling. Mirrors
 * the `<Input>` API for size/invalid/monospace. Use inside `<Field>`
 * for label+hint+error composition.
 *
 * Layer: Primitive (Layer 1).
 *
 * Usage:
 *   <Field label="Description" htmlFor="desc">
 *     <Textarea id="desc" rows={4} value={...} onChange={...} />
 *   </Field>
 */

import { forwardRef, type ReactNode, type TextareaHTMLAttributes } from 'react';

export type TextareaSize = 'sm' | 'md' | 'lg';

const SIZE_CLASSES: Record<TextareaSize, string> = {
  sm: 'text-xs',
  md: '',
  lg: 'text-base',
};

export interface TextareaProps
  extends Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'size'> {
  size?: TextareaSize;
  invalid?: boolean;
  monospace?: boolean;
  /** Disable resize handle. Default: `false`. */
  noResize?: boolean;
  /** Action displayed inside the composer chrome, below the editable text. */
  action?: ReactNode;
  /**
   * Layout-positioning classes only (max-width caps, grid placement).
   * NEVER size/spacing/color — use typed props.
   */
  className?: string;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  function Textarea(
    {
      size = 'md',
      invalid = false,
      monospace = false,
      noResize = false,
      action,
      className,
      rows = 3,
      ...rest
    },
    ref,
  ) {
    const classes = [
      'app-input',
      SIZE_CLASSES[size],
      invalid
        ? 'border-[var(--danger-fg)] focus:shadow-[0_0_0_2px_var(--danger-bg)]'
        : '',
      monospace ? 'font-mono' : '',
      noResize ? 'resize-none' : '',
      className ?? '',
    ]
      .filter(Boolean)
      .join(' ');
    if (action) {
      return <div className="app-input relative p-0 focus-within:ring-2 focus-within:ring-[var(--focus-ring-color)]">
        <textarea ref={ref} rows={rows} className={classes + ' block w-full'}
          aria-invalid={invalid || undefined} {...rest}
          style={{ ...rest.style, border: 0, background: 'transparent', paddingBottom: '4rem', boxShadow: 'none' }} />
        <div className="absolute bottom-2 right-2">{action}</div>
      </div>;
    }
    return (
      <textarea
        ref={ref}
        rows={rows}
        className={classes}
        aria-invalid={invalid || undefined}
        {...rest}
      />
    );
  },
);
