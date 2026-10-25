import { useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';
import { Button } from '../../../components/ui/Button';

/** Measure rendered height so wrapping, newlines and dock resizing all count. */
export function CollapsibleUserMessage({ children }: { children: ReactNode }) {
  const [expanded, setExpanded] = useState(false);
  const [overflowing, setOverflowing] = useState(false);
  const preview = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const contentId = useId();

  useLayoutEffect(() => {
    const measure = () => {
      const element = preview.current;
      // Keep the collapse control while expanded; remeasure after collapsing.
      if (element && !expanded) setOverflowing(element.scrollHeight > element.clientHeight + 1);
    };
    measure();
    const resize = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    if (preview.current) resize?.observe(preview.current);
    if (content.current) resize?.observe(content.current);
    window.addEventListener('resize', measure);
    return () => { resize?.disconnect(); window.removeEventListener('resize', measure); };
  }, [children, expanded]);

  return (
    <div className="min-w-0">
      <div ref={preview} id={contentId} className={expanded ? undefined : 'max-h-[min(16rem,40vh)] overflow-hidden'}>
        <div ref={content}>{children}</div>
      </div>
      {overflowing && <Button variant="ghost" size="sm" className="mt-1" aria-expanded={expanded} aria-controls={contentId}
        onClick={() => setExpanded(value => !value)}
        icon={<ChevronDown size={14} aria-hidden className={expanded ? 'rotate-180' : undefined} />}>
        {expanded ? 'Show less' : 'Show more'}
      </Button>}
    </div>
  );
}
