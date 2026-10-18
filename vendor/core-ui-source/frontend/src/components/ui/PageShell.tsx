import type { CSSProperties, ReactNode } from 'react';

/**
 * PageShell — the single source of truth for top-level page chrome:
 * vertical rhythm (`pt-8 md:pt-12 pb-20`) and the full-bleed canvas
 * onto which `PageSection` lays gutters and a `max-w-page` cap.
 *
 * Use it as the outermost element returned from every route-level
 * page component. The shape inside is always:
 *
 *   <PageShell>
 *     <PageSection>{header}</PageSection>
 *     <PageSection.Separator />          // optional rule
 *     <PageSection className="mt-8">{body}</PageSection>
 *   </PageShell>
 *
 * Centralising these tokens means a theme/spacing change ripples
 * through every page from one file — pages can no longer drift.
 */
export interface PageShellProps {
  children: ReactNode;
  /** Optional className appended to the wrapper for one-off tweaks. */
  className?: string;
}

export function PageShell({ children, className }: PageShellProps) {
  return (
    <div
      className={[
        'w-full min-w-0 pt-8 md:pt-12 pb-20',
        className ?? '',
      ].join(' ')}
    >
      {children}
    </div>
  );
}

export interface PageSectionProps {
  children: ReactNode;
  /** Optional className appended to the outer gutter row (e.g. `mt-8`). */
  className?: string;
  /** Optional className appended to the inner `max-w-page` container. */
  innerClassName?: string;
  /** Optional inline style applied to the inner `max-w-page` container.
   *  Useful for dynamic grid-template-columns (e.g. a user-resizable
   *  right rail) that can't be expressed as a Tailwind utility. */
  innerStyle?: CSSProperties;
}

/**
 * PageSection — a single horizontally-gutter-clamped band inside a
 * PageShell. Encapsulates the duplicated
 *
 *   <div className="px-3 md:px-16">
 *     <div className="min-w-0 w-full max-w-page mx-auto">…</div>
 *   </div>
 *
 * pair so callers express only their own spacing (e.g. `mt-8`) and
 * content. The full-bleed separator rule that sits between header
 * and body is exposed as `PageSection.Separator` so the same
 * `border-[var(--panel-border)]` token lives in one place.
 */
export function PageSection({
  children,
  className,
  innerClassName,
  innerStyle,
}: PageSectionProps) {
  return (
    <div className={['px-3 md:px-16', className ?? ''].join(' ')}>
      <div
        className={[
          'min-w-0 w-full max-w-page mx-auto',
          innerClassName ?? '',
        ].join(' ')}
        style={innerStyle}
      >
        {children}
      </div>
    </div>
  );
}

function PageSectionSeparator() {
  return (
    <div
      role="separator"
      aria-hidden
      className="border-t border-[var(--panel-border)]"
    />
  );
}

PageSection.Separator = PageSectionSeparator;
