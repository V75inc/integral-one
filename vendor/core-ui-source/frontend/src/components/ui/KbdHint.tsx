import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';

/**
 * KbdHint — renders a keyboard shortcut hint (e.g. ⌘K, Esc, Ctrl+Shift+P)
 * styled as small softly-bordered keycaps. Use inline next to actions or
 * right-anchored in inputs (e.g. command bar).
 *
 * The optional `auto` mode renders ⌘ on macOS and Ctrl elsewhere when the
 * passed `keys` array contains the literal string "Mod".
 */
interface KbdHintProps {
  keys: ReactNode[]; // e.g. ['⌘', 'K'] or ['Mod', 'K'] with auto=true
  auto?: boolean; // resolve "Mod" → ⌘ / Ctrl
  className?: string;
  size?: 'xs' | 'sm';
}

function useIsMac() {
  const [isMac, setIsMac] = useState(false);
  useEffect(() => {
    const ua = (navigator.userAgent || navigator.platform || '').toLowerCase();
    setIsMac(/mac|ipod|iphone|ipad/.test(ua));
  }, []);
  return isMac;
}

export function KbdHint({
  keys,
  auto = false,
  className = '',
  size = 'sm',
}: KbdHintProps) {
  const isMac = useIsMac();
  const padding = size === 'xs' ? 'min-w-[1rem] px-1 h-4 text-[12px]' : 'min-w-[1.25rem] px-1.5 h-5 text-[13px]';

  return (
    <span className={`inline-flex items-center gap-0.5 ${className}`}>
      {keys.map((k, i) => {
        const resolved =
          auto && k === 'Mod' ? (isMac ? '⌘' : 'Ctrl') : k;
        return (
          <kbd
            key={i}
            className={[
              'inline-flex items-center justify-center rounded',
              'bg-[var(--panel-2)] border border-[var(--panel-border)]',
              'text-[var(--text-muted)] font-medium leading-none',
              'shadow-[var(--shadow-sm)]',
              padding,
            ].join(' ')}
          >
            {resolved}
          </kbd>
        );
      })}
    </span>
  );
}
