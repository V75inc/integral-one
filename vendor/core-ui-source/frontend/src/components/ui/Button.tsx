import { Loader2 } from 'lucide-react';
import { LINE_ICON_STROKE } from './IconWell';
interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary'|'secondary'|'ghost'|'danger'|'outline';
  size?: 'xs'|'sm'|'md'|'lg';
  loading?: boolean;
  icon?: React.ReactNode;
}
export function Button({ variant='primary', size='md', loading, icon, children, className='', disabled, ...props }: ButtonProps) {
  const v: Record<string,string> = {
    primary: 'bg-[var(--cta-bg)] hover:bg-[var(--cta-hover)] text-[var(--cta-fg)] shadow-sm',
    secondary: 'bg-[var(--panel-2)] hover:bg-[var(--panel)] text-[var(--text)] border border-[var(--panel-border)]',
    ghost: 'hover:bg-[var(--panel-2)] text-[var(--text-muted)] hover:text-[var(--text)]',
    danger: 'bg-[var(--danger-fg)] hover:brightness-110 text-white shadow-[var(--shadow-sm)]',
    outline: 'border border-[var(--panel-border)] bg-[var(--panel)] hover:bg-[var(--panel-2)] text-[var(--text)]',
  };
  const s: Record<string,string> = {
    xs: 'px-2 py-1 text-xs gap-1', sm: 'px-3 py-1.5 text-sm gap-1.5',
    md: 'px-4 py-2 text-sm gap-2', lg: 'px-5 py-2.5 text-base gap-2',
  };
  return (
    <button {...props} disabled={disabled||loading} data-variant={variant}
      className={`inline-flex items-center justify-center font-medium rounded-[var(--radius-input)] transition-[background-color,color,filter,transform] duration-fast ease-fast active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring-color)] ${v[variant]} ${s[size]} disabled:opacity-50 disabled:cursor-not-allowed ${className}`}>
      {loading ? (
        <Loader2
          size={14}
          strokeWidth={LINE_ICON_STROKE}
          className="animate-spin"
        />
      ) : (
        icon
      )}
      {children}
    </button>
  );
}
