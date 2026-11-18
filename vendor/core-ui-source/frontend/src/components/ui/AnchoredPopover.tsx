import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

/**
 * A small panel that opens under an element and stays inside the window. It closes on Escape and on a click
 * outside it (a click on its own anchor is the anchor's to handle, so a button can open and close it).
 */
export function AnchoredPopover({
  anchor, onClose, children, width = 288, label,
}: { anchor: HTMLElement | null; onClose(): void; children: ReactNode; width?: number; label: string }) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [style, setStyle] = useState<CSSProperties>({ visibility: 'hidden' });

  useLayoutEffect(() => {
    if (!anchor) return;
    const place = () => {
      const a = anchor.getBoundingClientRect();
      const w = Math.min(width, window.innerWidth - 24);
      const left = Math.max(12, Math.min(a.left, window.innerWidth - w - 12));
      const top = Math.min(a.bottom + 6, Math.max(12, window.innerHeight - 160));
      setStyle({ position: 'fixed', top, left, width: w, maxHeight: Math.max(160, window.innerHeight - top - 12), visibility: 'visible' });
    };
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => { window.removeEventListener('resize', place); window.removeEventListener('scroll', place, true); };
  }, [anchor, width]);

  useEffect(() => {
    const down = (e: MouseEvent) => {
      const t = e.target as Node;
      if (ref.current?.contains(t) || anchor?.contains(t)) return;
      onClose();
    };
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('mousedown', down);
    window.addEventListener('keydown', key);
    return () => { window.removeEventListener('mousedown', down); window.removeEventListener('keydown', key); };
  }, [anchor, onClose]);

  if (!anchor) return null;
  return createPortal(
    <div
      ref={ref}
      role="dialog"
      aria-label={label}
      style={style}
      className="z-50 overflow-auto rounded-[var(--radius-card)] border border-[var(--panel-border)] bg-[var(--panel)] p-3 shadow-[var(--shadow-pop)]"
    >
      {children}
    </div>,
    document.body,
  );
}
