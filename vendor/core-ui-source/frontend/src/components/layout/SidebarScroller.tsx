/**
 * SidebarScroller — hidden-scrollbar scroll region with edge affordances.
 *
 * The native scrollbar is hidden in both gecko and webkit so the sidebar's
 * vertical divider can sit flush against the rail. Scrollability is
 * signalled by:
 *   - 12px linear-gradient fade at the top/bottom edges (always present
 *     when content overflows; absent when fully scrolled to that edge).
 *   - Tiny chevron affordances (▲ / ▼) anchored at the same edges that
 *     also act as click targets to nudge-scroll one page in that
 *     direction. Hidden when the user is at the corresponding edge.
 *
 * Why not just rely on overflow:auto's native bar? Per Quiet Premium
 * spec we keep chrome minimal; the native bar conflicts with the
 * scrollbar-free aesthetic and pushes the rail divider off-axis. A
 * managed affordance is more honest about what's hidden.
 *
 * The component re-measures on resize, scroll, and content changes
 * (consumers pass a stable `contentSignal` prop that ticks whenever
 * the items list size could change — e.g. orgs/scope/recents).
 */

import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { ChevronUp, ChevronDown } from 'lucide-react';
import { LINE_ICON_STROKE } from '../ui';

interface Props {
  children: ReactNode;
  /** Truthy bump whenever the contained list lengths could change so we
   *  re-measure scroll affordance without subscribing to ResizeObserver. */
  contentSignal?: unknown;
  /** Disable scroll/affordances (used in rail-collapsed mode so hover
   *  tooltips can extend past the right edge of the rail). */
  disabled?: boolean;
  className?: string;
}

interface EdgeState {
  top: boolean; // true means MORE content above (top edge reveals affordance)
  bottom: boolean;
}

const EDGE_HIT_PX = 1;

export function SidebarScroller({
  children,
  contentSignal,
  disabled = false,
  className,
}: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState<EdgeState>({ top: false, bottom: false });

  useEffect(() => {
    if (disabled) return;
    const node = scrollRef.current;
    if (!node) return;

    const measure = () => {
      const { scrollTop, scrollHeight, clientHeight } = node;
      setEdges({
        top: scrollTop > EDGE_HIT_PX,
        bottom: scrollTop + clientHeight < scrollHeight - EDGE_HIT_PX,
      });
    };

    measure();
    node.addEventListener('scroll', measure, { passive: true });
    window.addEventListener('resize', measure);
    // Re-measure after a paint in case fonts/icons settle late.
    const raf = requestAnimationFrame(measure);
    return () => {
      node.removeEventListener('scroll', measure);
      window.removeEventListener('resize', measure);
      cancelAnimationFrame(raf);
    };
  }, [disabled, contentSignal]);

  const nudge = (dir: 1 | -1) => {
    const node = scrollRef.current;
    if (!node) return;
    node.scrollBy({ top: dir * node.clientHeight * 0.8, behavior: 'smooth' });
  };

  if (disabled) {
    return (
      <div className={['flex-1 min-h-0', className].filter(Boolean).join(' ')}>
        {children}
      </div>
    );
  }

  return (
    <div className={['relative flex-1 min-h-0', className].filter(Boolean).join(' ')}>
      {/* Top edge fade — masks the first 14px of content when there's
          more above. Pointer-events:none so it doesn't steal clicks. */}
      <div
        aria-hidden
        className={[
          'pointer-events-none absolute inset-x-0 top-0 h-4 z-10',
          'bg-gradient-to-b from-[var(--bg)] to-transparent',
          'transition-opacity duration-fast',
          edges.top ? 'opacity-100' : 'opacity-0',
        ].join(' ')}
      />
      {/* Bottom edge fade — symmetric. */}
      <div
        aria-hidden
        className={[
          'pointer-events-none absolute inset-x-0 bottom-0 h-4 z-10',
          'bg-gradient-to-t from-[var(--bg)] to-transparent',
          'transition-opacity duration-fast',
          edges.bottom ? 'opacity-100' : 'opacity-0',
        ].join(' ')}
      />

      {/* Top scroll chevron — discoverable click target. */}
      {edges.top ? (
        <button
          type="button"
          onClick={() => nudge(-1)}
          aria-label="Scroll up in sidebar"
          className="
            absolute top-0 right-0 z-20
            inline-flex items-center justify-center w-6 h-6 rounded-md
            text-[var(--text-subtle)] hover:text-[var(--text)] hover:bg-[var(--panel)]
            focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring-color)]
            transition-colors duration-fast
          "
        >
          <ChevronUp size={12} strokeWidth={LINE_ICON_STROKE} />
        </button>
      ) : null}
      {/* Bottom scroll chevron. */}
      {edges.bottom ? (
        <button
          type="button"
          onClick={() => nudge(1)}
          aria-label="Scroll down in sidebar"
          className="
            absolute bottom-0 right-0 z-20
            inline-flex items-center justify-center w-6 h-6 rounded-md
            text-[var(--text-subtle)] hover:text-[var(--text)] hover:bg-[var(--panel)]
            focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring-color)]
            transition-colors duration-fast
          "
        >
          <ChevronDown size={12} strokeWidth={LINE_ICON_STROKE} />
        </button>
      ) : null}

      {/* Scroll region — overflow-y:auto but with the native bar hidden so
          the rail divider is the only vertical line visible at the edge.
          Tailwind's arbitrary `[scrollbar-width:none]` covers Firefox;
          the global rule in index.css covers webkit. */}
      <div
        ref={scrollRef}
        className="
          h-full overflow-y-auto overscroll-contain
          [scrollbar-width:none] [&::-webkit-scrollbar]:hidden
        "
      >
        {children}
      </div>
    </div>
  );
}
