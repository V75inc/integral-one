import { useEffect, useRef, useState } from 'react';

/** The drawing width for a chart: its container's width, kept within [min, max], so text stays a readable size. */
export function useChartWidth(min: number, max: number, fallback: number) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(fallback);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === 'undefined') return undefined;
    const measure = () => { const w = el.getBoundingClientRect().width; if (w > 0) setWidth(Math.max(min, Math.min(max, Math.round(w)))); };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [min, max]);
  return { ref, width };
}
