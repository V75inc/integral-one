import { useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { ChevronDownIcon } from 'lucide-react';
import { cn } from '../../../lib/cn';

/** Only disclose additional detail or text actually clipped by the summary. */
export function ExpandableChatError({
  summary, children, className,
}: { summary: ReactNode; children?: ReactNode; className?: string }) {
  const [expanded, setExpanded] = useState(false);
  const [truncated, setTruncated] = useState(false);
  const [distinctDetail, setDistinctDetail] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const summaryRef = useRef<HTMLSpanElement>(null);
  const detailRef = useRef<HTMLDivElement>(null);
  const detailId = useId();
  const detailText = useRef('');
  const [measuredChildren, setMeasuredChildren] = useState<{ value: ReactNode } | null>(null);
  const needsMeasurement = measuredChildren?.value !== children;
  useLayoutEffect(() => {
    const measure = () => {
      const node = summaryRef.current;
      if (!node) return;
      const normalize = (value: string | null | undefined) => (value || '').replace(/\s+/g, ' ').trim();
      if (children == null) detailText.current = '';
      else if (detailRef.current) detailText.current = normalize(detailRef.current.textContent);
      const detail = detailText.current;
      if (needsMeasurement) setMeasuredChildren({ value: children });
      setDistinctDetail(Boolean(detail && detail !== normalize(node.textContent)));
      if (!expanded) setTruncated(node.scrollHeight > node.clientHeight + 1);
    };
    measure();
    const resize = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    if (containerRef.current) resize?.observe(containerRef.current);
    const mutation = new MutationObserver(measure);
    if (containerRef.current) mutation.observe(containerRef.current, { childList: true, characterData: true, subtree: true });
    window.addEventListener('resize', measure);
    return () => { resize?.disconnect(); mutation.disconnect(); window.removeEventListener('resize', measure); };
  }, [summary, children, expanded, needsMeasurement]);
  const expandable = truncated || distinctDetail;
  const message = <span ref={summaryRef} className={cn('min-w-0 flex-1 whitespace-pre-wrap break-words [overflow-wrap:anywhere]', !expanded && 'line-clamp-2')}>{summary}</span>;
  return (
    <div ref={containerRef} className={className}>
      {expandable ? <button type="button" aria-expanded={expanded}
        aria-controls={distinctDetail && expanded ? detailId : undefined}
        onClick={() => setExpanded(value => !value)}
        className="flex w-full items-start gap-2 rounded text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
        title={expanded ? 'Hide full error' : 'Show full error'}>
        {message}
        <ChevronDownIcon aria-hidden size={16} className={cn('mt-0.5 shrink-0 transition-transform', expanded && 'rotate-180')} />
      </button> : <div className="flex min-w-0">{message}</div>}
      {children != null && (needsMeasurement || (expanded && distinctDetail)) && <div ref={detailRef} id={detailId} hidden={!expanded || !distinctDetail}
        className="mt-2 whitespace-pre-wrap break-words [overflow-wrap:anywhere]">{children}</div>}
    </div>
  );
}
