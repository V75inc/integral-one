import { useEffect } from 'react';

/**
 * Swallow the first window click after a dnd-kit drag ends so a nested
 * <Link> does not receive a phantom navigation click.
 */
export function usePhantomClickGuard(isDragging: boolean) {
  useEffect(() => {
    if (!isDragging) return;
    let armed = true;
    const swallow = (e: MouseEvent) => {
      if (!armed) return;
      armed = false;
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      window.removeEventListener('click', swallow, true);
    };
    window.addEventListener('click', swallow, true);
    return () => {
      window.setTimeout(() => {
        armed = false;
        window.removeEventListener('click', swallow, true);
      }, 300);
    };
  }, [isDragging]);
}
