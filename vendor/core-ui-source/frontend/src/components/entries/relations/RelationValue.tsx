import { Fragment, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Surface, Text } from '../../../ui';
import type { RelationFieldTarget } from '../../../types';
import { useRelationLabels, type RelationSpec } from './useRelationLabels';
import { routeForRelationTarget, type RelationNavContext } from './routeForRelationTarget';

export type RelationVariant = 'inline' | 'chips' | 'cell';

export interface RelationValueProps {
  value: unknown;
  relation: RelationSpec | undefined;
  variant?: RelationVariant;
  /** Rendered when `value` resolves to zero ids. Default: render nothing. */
  emptyFallback?: ReactNode;
  /** Truncate the rendered list. Default: render all. */
  maxItems?: number;
  /** Stop propagation on link clicks (avoids opening parent row/card). */
  stopPropagation?: boolean;
  /** Called before internal navigation (e.g. dismiss host modal). */
  onNavigate?: () => void;
  /** Preserve parent entry in breadcrumbs when drilling into a related entry. */
  navContext?: RelationNavContext | null;
  className?: string;
}

/**
 * Render a single resolved target. For chips, the link is wrapped in a
 * pill <Surface tone="panel-2"> so the chip background comes from the
 * typed primitive (Phase 3-A FE templating). For inline / cell, the
 * link is rendered bare with an underline.
 */
function ResolvedTarget({
  target,
  variant,
  stopPropagation,
  onNavigate,
  navContext,
}: {
  target: RelationFieldTarget;
  variant: RelationVariant;
  stopPropagation: boolean;
  onNavigate?: () => void;
  navContext?: RelationNavContext | null;
}) {
  const route = routeForRelationTarget(target, navContext);
  const handleNavigate = (e: React.MouseEvent) => {
    if (stopPropagation) e.stopPropagation();
    onNavigate?.();
  };
  const inlineLinkClass =
    'text-[var(--link)] hover:text-[var(--link-hover)] underline underline-offset-2 decoration-[var(--panel-border)] hover:decoration-[var(--link-hover)] break-words';

  if (variant === 'chips') {
    // Chip background + radius come from <Surface tone="panel-2" radius="pill">
    // (the typed primitive — Phase 3-A FE templating). Long track titles
    // truncate instead of wrapping into multi-line pills.
    const chipClass =
      'inline-block max-w-[min(100%,18rem)] truncate px-2.5 py-1 align-middle';
    if (!route) {
      return (
        <span title={target.label} className="inline-flex max-w-full">
          <Surface
            as="span"
            tone="panel-2"
            border="none"
            radius="pill"
            className={chipClass}
          >
            {target.label}
          </Surface>
        </span>
      );
    }
    return (
      <Link
        to={route}
        className="inline-flex max-w-full rounded-full text-[var(--link)] hover:text-[var(--link-hover)] no-underline"
        onClick={handleNavigate}
        title={target.label}
      >
        <Surface
          as="span"
          tone="panel-2"
          border="none"
          radius="pill"
          className={chipClass}
        >
          {target.label}
        </Surface>
      </Link>
    );
  }

  if (!route) {
    return <span className="break-words">{target.label}</span>;
  }
  return (
    <Link
      to={route}
      className={inlineLinkClass}
      onClick={handleNavigate}
    >
      {target.label}
    </Link>
  );
}

/**
 * Loading placeholder. Uses <Surface tone="panel-2"> so the skeleton
 * background derives from the typed surface tone (no raw literal).
 */
function Skeleton({ variant }: { variant: RelationVariant }) {
  const w = variant === 'cell' ? 'w-16' : 'w-20';
  return (
    <Surface
      as="span"
      tone="panel-2"
      border="none"
      radius="input"
      className={`inline-block h-3 ${w} animate-pulse align-middle`}
      // exposed for test assertion: distinguishes loading state from rendered content
      // (Surface forwards id/role/className/children only; data-* is applied via a wrapper)
    >
      <span data-relation-skeleton="1" className="sr-only">
        loading
      </span>
    </Surface>
  );
}

/**
 * Render a relation field value as resolved labels (linked when routable).
 * Variants:
 *  - inline: comma-separated links, suitable for prose contexts
 *  - chips:  pill list, suitable for tag-like grouping (entry card meta)
 *  - cell:   single-line truncated, suitable for table cells
 */
export function RelationValue({
  value,
  relation,
  variant = 'inline',
  emptyFallback = null,
  maxItems,
  stopPropagation = false,
  onNavigate,
  navContext = null,
  className = '',
}: RelationValueProps) {
  const { targets, loading } = useRelationLabels(value, relation);

  if (targets.length === 0 && !loading) {
    return <>{emptyFallback}</>;
  }

  const limited =
    typeof maxItems === 'number' && maxItems >= 0
      ? targets.slice(0, maxItems)
      : targets;
  const hiddenCount = targets.length - limited.length;

  // While the first resolution is in flight, render one skeleton per id
  // instead of the deterministic fallback labels — keeps "loading" visually
  // distinct from "resolved but unnamed".
  if (loading) {
    if (variant === 'cell') {
      return (
        <span className={`block max-w-full truncate text-sm ${className}`.trim()}>
          {limited.map((_, i) => (
            <Fragment key={i}>
              {i > 0 ? ' ' : null}
              <Skeleton variant={variant} />
            </Fragment>
          ))}
        </span>
      );
    }
    const wrapCls =
      variant === 'chips'
        ? `inline-flex flex-wrap gap-1 ${className}`.trim()
        : `inline-flex flex-wrap gap-x-1 ${className}`.trim();
    return (
      <span className={wrapCls}>
        {limited.map((_, i) => (
          <Skeleton key={i} variant={variant} />
        ))}
      </span>
    );
  }

  if (variant === 'cell') {
    return (
      <span
        className={`block max-w-full truncate text-sm ${className}`.trim()}
        title={targets.map(t => t.label).join(', ')}
      >
        {limited.map((t, i) => (
          <Fragment key={`${t.id}-${i}`}>
            {i > 0 ? ', ' : null}
            <ResolvedTarget
              target={t}
              variant={variant}
              stopPropagation={stopPropagation}
              onNavigate={onNavigate}
              navContext={navContext}
            />
          </Fragment>
        ))}
        {hiddenCount > 0 ? (
          <Text variant="body-sm" tone="muted">
            {' '}
            +{hiddenCount}
          </Text>
        ) : null}
      </span>
    );
  }

  if (variant === 'chips') {
    return (
      <span className={`inline-flex flex-wrap gap-1 ${className}`.trim()}>
        {limited.map((t, i) => (
          <ResolvedTarget
            key={`${t.id}-${i}`}
            target={t}
            variant={variant}
            stopPropagation={stopPropagation}
            onNavigate={onNavigate}
            navContext={navContext}
          />
        ))}
      </span>
    );
  }

  // inline
  return (
    <span className={`inline-flex flex-wrap gap-x-1 ${className}`.trim()}>
      {limited.map((t, i) => (
        <Fragment key={`${t.id}-${i}`}>
          {i > 0 ? (
            <Text variant="body" tone="subtle">
              ,
            </Text>
          ) : null}
          <ResolvedTarget
            target={t}
            variant={variant}
            stopPropagation={stopPropagation}
            onNavigate={onNavigate}
            navContext={navContext}
          />
        </Fragment>
      ))}
      {hiddenCount > 0 ? (
        <Text variant="body-sm" tone="muted">
          {' '}
          +{hiddenCount}
        </Text>
      ) : null}
    </span>
  );
}
