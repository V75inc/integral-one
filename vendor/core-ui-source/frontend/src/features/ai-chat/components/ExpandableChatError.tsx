import { useId, useState, type ReactNode } from 'react';
import { ChevronDownIcon } from 'lucide-react';
import { cn } from '../../../lib/cn';

/** Keep the conversation readable; reveal the full error only on request. */
export function ExpandableChatError({
  summary, children, className,
}: { summary: ReactNode; children?: ReactNode; className?: string }) {
  const [expanded, setExpanded] = useState(false);
  const detailId = useId();
  return (
    <div className={className}>
      <button
        type="button"
        aria-expanded={expanded}
        aria-controls={expanded ? detailId : undefined}
        onClick={() => setExpanded(value => !value)}
        className="flex w-full items-start gap-2 rounded text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
        title={expanded ? 'Hide full error' : 'Show full error'}
      >
        <span className="min-w-0 flex-1 line-clamp-2">{summary}</span>
        <ChevronDownIcon aria-hidden size={16} className={cn('mt-0.5 shrink-0 transition-transform', expanded && 'rotate-180')} />
      </button>
      {expanded && (
        <div id={detailId} className="mt-2 whitespace-pre-wrap break-words [overflow-wrap:anywhere]">
          {children ?? summary}
        </div>
      )}
    </div>
  );
}
