interface BadgeProps { children: React.ReactNode; variant?: string; className?: string; }

/**
 * Generic count/label chip. For status pills (UPPERCASE) use the `Pill`
 * primitive instead. Variants drive semantic color tokens — never hardcode
 * Tailwind palette classes here.
 */
export function Badge({ children, variant='default', className='' }: BadgeProps) {
  const v: Record<string,string> = {
    default: 'bg-[var(--badge-muted-bg)] text-[var(--badge-muted-fg)]',
    primary: 'bg-[var(--badge-muted-bg)] text-[var(--badge-muted-fg)]',
    success: 'bg-[var(--success-bg)] text-[var(--success-fg)]',
    warning: 'bg-[var(--warn-bg)] text-[var(--warn-fg)]',
    danger:  'bg-[var(--danger-bg)] text-[var(--danger-fg)]',
    info:    'bg-[var(--info-bg)] text-[var(--info-fg)]',
    ai:      'bg-[var(--ai-bg)] text-[var(--ai-fg)]',
  };
  return <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium ${v[variant]||v.default} ${className}`}>{children}</span>;
}
