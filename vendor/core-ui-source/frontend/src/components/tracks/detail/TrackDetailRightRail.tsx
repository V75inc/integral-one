import type { PointerEvent as ReactPointerEvent, RefObject } from 'react';
import { lazy, Suspense } from 'react';
import { ActivityPanel } from '../../activity/ActivityPanel';
import { SidebarScroller } from '../../layout/SidebarScroller';
import { Text } from '../../../ui';

const TrackConfigPanel = lazy(() =>
  import('../TrackConfigPanel').then(m => ({ default: m.TrackConfigPanel }))
);

export interface TrackDetailRightRailProps {
  trackId: string;
  trackActivityOpen: boolean;
  trackConfigOpen: boolean;
  canAdminTrack: boolean;
  asideMaxH: string;
  asideRef: RefObject<HTMLElement>;
  onRailPointerDown: (e: ReactPointerEvent<HTMLDivElement>) => void;
  onRailPointerMove: (e: ReactPointerEvent<HTMLDivElement>) => void;
  onRailPointerUp: (e: ReactPointerEvent<HTMLDivElement>) => void;
}

export function TrackDetailRightRail({
  trackId,
  trackActivityOpen,
  trackConfigOpen,
  canAdminTrack,
  asideMaxH,
  asideRef,
  onRailPointerDown,
  onRailPointerMove,
  onRailPointerUp,
}: TrackDetailRightRailProps) {
  return (
    <div
      data-testid="track-sidebar"
      className="relative hidden xl:block min-w-0 xl:border-l xl:border-[var(--panel-border)] xl:pl-6"
    >
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize track sidebar"
        onPointerDown={onRailPointerDown}
        onPointerMove={onRailPointerMove}
        onPointerUp={onRailPointerUp}
        onPointerCancel={onRailPointerUp}
        className="absolute top-0 left-0 -translate-x-1/2 h-full w-2 cursor-ew-resize hover:bg-[var(--panel-border)] transition-colors z-10"
      />
      <aside
        ref={asideRef}
        style={{ height: asideMaxH }}
        className="sticky top-6 pt-8 flex flex-col min-h-0"
      >
        {trackActivityOpen ? (
          <>
            <h3 className="text-[11px] font-medium uppercase tracking-[0.08em] text-[color:var(--text-subtle)] shrink-0">
              Activity
            </h3>
            <SidebarScroller
              contentSignal={`track-activity:${trackId}`}
              className="mt-3"
            >
              <div id="track-activity-panel" className="min-w-0">
                <ActivityPanel
                  scope={`track:${trackId}`}
                  title="Track activity"
                  className="text-sm"
                  chromeless
                />
              </div>
            </SidebarScroller>
          </>
        ) : null}
        {trackConfigOpen ? (
          <>
            <SidebarScroller
              contentSignal={`track-config:${trackId}`}
              className="mt-3"
            >
              <div id="track-config-panel" className="min-w-0">
                <Suspense
                  fallback={
                    <Text as="div" variant="body" tone="muted" className="animate-pulse">
                      Loading configuration…
                    </Text>
                  }
                >
                  <TrackConfigPanel
                    trackId={trackId}
                    canEdit={canAdminTrack}
                  />
                </Suspense>
              </div>
            </SidebarScroller>
          </>
        ) : null}
      </aside>
    </div>
  );
}
