import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from 'react';

const MIN_RAIL_WIDTH = 320;
const RAIL_LS_KEY = 'track-detail:right-rail-width';

function getMaxRailWidth() {
  return Math.min(
    720,
    typeof window !== 'undefined' ? window.innerWidth * 0.5 : 720,
  );
}

/**
 * Resizable right-rail width + sticky aside viewport height for Track detail.
 */
export function useTrackDetailRightRail(opts: {
  rightRailOpen: boolean;
  trackActivityOpen: boolean;
  trackConfigOpen: boolean;
}): {
  rightRailWidth: number;
  asideMaxH: string;
  asideRef: RefObject<HTMLElement>;
  handleRailPointerDown: (e: ReactPointerEvent<HTMLDivElement>) => void;
  handleRailPointerMove: (e: ReactPointerEvent<HTMLDivElement>) => void;
  handleRailPointerUp: (e: ReactPointerEvent<HTMLDivElement>) => void;
} {
  const [rightRailWidth, setRightRailWidth] = useState<number>(() => {
    if (typeof window === 'undefined') return MIN_RAIL_WIDTH;
    const raw = window.localStorage.getItem(RAIL_LS_KEY);
    const n = raw != null ? Number(raw) : MIN_RAIL_WIDTH;
    if (!Number.isFinite(n)) return MIN_RAIL_WIDTH;
    return Math.max(MIN_RAIL_WIDTH, Math.min(getMaxRailWidth(), n));
  });
  const railDragRef = useRef<{ startX: number; startWidth: number } | null>(
    null,
  );
  const handleRailPointerDown = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
      railDragRef.current = {
        startX: e.clientX,
        startWidth: rightRailWidth,
      };
      document.body.style.cursor = 'ew-resize';
      document.body.style.userSelect = 'none';
    },
    [rightRailWidth],
  );
  const handleRailPointerMove = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      const drag = railDragRef.current;
      if (!drag) return;
      const delta = drag.startX - e.clientX;
      const next = Math.max(
        MIN_RAIL_WIDTH,
        Math.min(getMaxRailWidth(), drag.startWidth + delta),
      );
      setRightRailWidth(next);
    },
    [],
  );
  const handleRailPointerUp = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (!railDragRef.current) return;
      railDragRef.current = null;
      try {
        (e.currentTarget as HTMLDivElement).releasePointerCapture(e.pointerId);
      } catch {
        /* pointer may already be released */
      }
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      try {
        window.localStorage.setItem(RAIL_LS_KEY, String(rightRailWidth));
      } catch {
        /* localStorage may be unavailable (private mode) */
      }
    },
    [rightRailWidth],
  );
  useEffect(() => {
    const onResize = () => {
      setRightRailWidth(w =>
        Math.max(MIN_RAIL_WIDTH, Math.min(getMaxRailWidth(), w)),
      );
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const asideRef = useRef<HTMLElement>(null);
  const [asideMaxH, setAsideMaxH] = useState<string>('100dvh');
  useEffect(() => {
    const recompute = () => {
      const el = asideRef.current;
      if (!el) return;
      const top = el.getBoundingClientRect().top;
      const sysBarVar = getComputedStyle(document.documentElement)
        .getPropertyValue('--system-bar-h')
        .trim();
      const sysBar = sysBarVar.endsWith('px')
        ? Number.parseFloat(sysBarVar)
        : 0;
      const max = Math.max(200, window.innerHeight - top - sysBar - 24);
      setAsideMaxH(`${max}px`);
    };
    recompute();
    window.addEventListener('scroll', recompute, { passive: true });
    window.addEventListener('resize', recompute);
    const ro = new ResizeObserver(recompute);
    const parent = asideRef.current?.parentElement;
    if (parent) ro.observe(parent);
    return () => {
      window.removeEventListener('scroll', recompute);
      window.removeEventListener('resize', recompute);
      ro.disconnect();
    };
  }, [
    opts.rightRailOpen,
    opts.trackActivityOpen,
    opts.trackConfigOpen,
  ]);

  return {
    rightRailWidth,
    asideMaxH,
    asideRef,
    handleRailPointerDown,
    handleRailPointerMove,
    handleRailPointerUp,
  };
}
