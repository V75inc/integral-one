import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useMatchesMedia } from '../../hooks/useMediaQuery';
import { Modal } from '../ui/Modal';
import { ArrowLeft, X } from 'lucide-react';
import { IconWell, LINE_ICON_STROKE } from '../ui/IconWell';
import { IconButton, Surface, Text } from '../../ui';

/**
 * Full-page chrome for EntryDetail's `variant="page"` mode. Deliberately
 * accepts Modal's FULL prop shape (including props it ignores — `open`,
 * `disableEscape`, `width`, `variant`, `initialFocusRef`) so EntryDetail
 * can pick between `Modal` and this component with a single `const Chrome
 * = variant === 'page' ? EntryDetailPageChrome : Modal` swap, instead of
 * restructuring its ~350 lines of inner content (header fields, related
 * views, comments, activity) into a shared variable. Opt-in per entry type
 * via `form_schema.open_as_page` — every entry type that doesn't set it
 * keeps using Modal exactly as before, unaffected by this file's existence.
 */
export function EntryDetailPageChrome({
  title,
  titleIcon,
  headerActions,
  onClose,
  children,
  canvas,
  sidePanel,
  panelTitle = 'Details',
  onPanelClose,
  allowAssistantDock = false,
}: {
  open?: boolean;
  onClose(): void;
  title?: string | React.ReactNode;
  titleIcon?: React.ReactNode;
  headerActions?: React.ReactNode;
  children: React.ReactNode;
  width?: string;
  tall?: boolean;
  sidePanel?: React.ReactNode;
  panelTitle?: string;
  onPanelClose?(): void;
  hasCompanionPanel?: boolean;
  allowAssistantDock?: boolean;
  variant?: 'default' | 'compact';
  disableEscape?: boolean;
  initialFocusRef?: React.RefObject<HTMLElement | null>;
  /** Opt-in (entry type ``canvas``): the entry's file, shown beside its fields. */
  canvas?: React.ReactNode;
}) {
  const desktop = useMatchesMedia('(min-width: 640px)');
  const [availableWidth, setAvailableWidth] = useState<number | null>(null);
  // On a squeezed desktop the utilities overlap only the entry, without a
  // scrim or focus trap over the independently usable assistant.
  const reservePanelSpace = desktop && (availableWidth === null || availableWidth >= 760);
  const [panelRight, setPanelRight] = useState(0);
  const [panelWidth, setPanelWidth] = useState(380);
  const pageRef = useRef<HTMLDivElement>(null);
  const [panelTop, setPanelTop] = useState(0);
  useEffect(() => {

    const measure = () => {
      const noticeHeight = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--system-bar-h')) || 0;
      const bounds = pageRef.current?.getBoundingClientRect();
      const width = bounds?.width ?? 0;
      if (bounds) setPanelRight(Math.max(0, window.innerWidth - (bounds.right ?? window.innerWidth)));
      const configuredPanelWidth = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--dialog-side-panel-w')) || 380;
      setPanelWidth(Math.min(configuredPanelWidth, width || configuredPanelWidth));
      // Border-box measurement stays stable when companion padding changes.
      if (width > 0) setAvailableWidth(width);
      setPanelTop(Math.max(noticeHeight, pageRef.current?.getBoundingClientRect().top ?? 0));
    };
    measure();
    window.addEventListener('resize', measure);
    window.addEventListener('scroll', measure, true);
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null;
    observer?.observe(document.documentElement);
    const styleObserver = new MutationObserver(measure);
    styleObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['style'] });
    if (pageRef.current) observer?.observe(pageRef.current);
    return () => {
      window.removeEventListener('resize', measure);
      window.removeEventListener('scroll', measure, true);
      observer?.disconnect();
      styleObserver.disconnect();
    };
  }, []);
  return (
    <div ref={pageRef} className="entry-page-container min-h-screen bg-[var(--bg)]"
      style={reservePanelSpace && sidePanel ? { paddingRight: panelWidth } : undefined}>
      <Surface
        as="header"
        tone="panel"
        border="none"
        radius="none"
        className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-3 border-b border-[var(--panel-border)] px-4 py-3 sm:px-6"
      >
        <div className="entry-page-header-title flex w-full min-w-0 items-center gap-3 sm:w-auto sm:flex-1">
          <IconButton
            label="Back"
            onClick={onClose}
            size="md"
            tone="muted"
            className="shrink-0"
          >
            <ArrowLeft size={16} strokeWidth={LINE_ICON_STROKE} />
          </IconButton>
          {titleIcon ? (
            <IconWell size="sm">{titleIcon}</IconWell>
          ) : null}
          <Text as="h1" variant="heading-sm" weight="semibold" className="flex min-w-0 items-center gap-2.5">
            {title}
          </Text>
        </div>
        {headerActions ? (
          <div className="ml-auto flex max-w-full shrink-0 flex-wrap items-center gap-1">{headerActions}</div>
        ) : null}
      </Surface>
      {canvas ? (
        <div
          data-testid="entry-canvas-layout"
          className="mx-auto grid max-w-[1800px] gap-4 px-4 py-4 sm:px-6 lg:grid-cols-[minmax(0,1.8fr)_minmax(0,1fr)]"
        >
          <div className="min-w-0 lg:sticky lg:top-[64px] lg:h-[calc(100vh-5.5rem)] lg:self-start">
            {canvas}
          </div>
          <div className="min-w-0">{children}</div>
        </div>
      ) : (
        <div className="mx-auto max-w-page px-0 md:px-2 py-4 sm:py-5">
          {children}
        </div>
      )}
      {sidePanel && desktop ? createPortal(
        <Surface as="aside" tone="panel" border="none" radius="none"
          aria-label="Entry utilities" data-testid="entry-page-utilities"
          style={{ top: panelTop, right: panelRight, width: panelWidth }}
          className="fixed bottom-0 z-20 flex min-h-0 flex-col border-l border-[var(--panel-border)]">
          <div className="flex shrink-0 items-center justify-between border-b border-[var(--panel-border)] px-4 py-3">
            <Text as="h2" variant="heading-sm" weight="semibold">{panelTitle}</Text>
            <IconButton label="Close details panel" title="Close details panel" onClick={onPanelClose} size="md">
              <X size={16} strokeWidth={LINE_ICON_STROKE} />
            </IconButton>
          </div>
          <div className="flex min-h-0 flex-1 flex-col">{sidePanel}</div>
        </Surface>, document.body
      ) : sidePanel ? (
        <Modal open allowAssistantDock={allowAssistantDock} onClose={() => onPanelClose?.()} title={panelTitle} placement="right" width="max-w-dialog-confirm">
          <div data-testid="entry-page-utilities" className="flex h-full min-h-0 flex-col">{sidePanel}</div>
        </Modal>
      ) : null}
    </div>
  );
}
