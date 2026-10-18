import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Avatar, AvatarStackedMeta } from '../../ui';
import { Surface, Text } from '../../../ui';
import { useScope } from '../../../context/ScopeContext';
import { useMemberLabel } from './useMemberLabel';

export type MemberVariant = 'inline' | 'chips' | 'cell';

export interface MemberValueProps {
  value: unknown;
  variant?: MemberVariant;
  /** Rendered when `value` is empty or resolves to no member. */
  emptyFallback?: ReactNode;
  /** Stop propagation on link clicks (avoids opening parent row/card). */
  stopPropagation?: boolean;
  className?: string;
}

function Skeleton({ variant }: { variant: MemberVariant }) {
  const w = variant === 'cell' ? 'w-16' : 'w-20';
  return (
    <Surface
      as="span"
      tone="panel-2"
      border="none"
      radius="input"
      className={`inline-block h-3 ${w} animate-pulse align-middle`}
    >
      <span data-member-skeleton="1" aria-hidden />
    </Surface>
  );
}

function memberRoute(workspaceId: string | undefined): string | null {
  return workspaceId ? `/workspaces/${encodeURIComponent(workspaceId)}/members` : null;
}

/**
 * Render a `member` field value as a resolved display name (linked to the
 * workspace members surface when routable). Variants mirror RelationValue:
 *  - inline: plain linked name
 *  - chips:  pill with avatar + name
 *  - cell:   single-line truncated name for tables
 */
export function MemberValue({
  value,
  variant = 'inline',
  emptyFallback = null,
  stopPropagation = false,
  className = '',
}: MemberValueProps) {
  const { scope } = useScope();
  const workspaceId = scope?.workspaceId;

  // Resolved BEFORE the array branch below, which returns early. A hook after
  // a conditional return changes the hook count between renders, so a field
  // toggling between a single member and a list threw "rendered fewer hooks
  // than expected". Arrays resolve to '' here — the array branch recurses into
  // MemberValue per item and each child does its own lookup — and
  // useMemberLabel('') is already the no-op path used for empty values.
  const userId =
    Array.isArray(value) || value == null || value === ''
      ? ''
      : String(value).trim();
  const { label, displayName, email, avatarAttachmentId, loading } =
    useMemberLabel(userId);

  if (Array.isArray(value)) {
    const cleanList = value.filter(val => val != null && val !== '');
    if (cleanList.length === 0) {
      return <>{emptyFallback}</>;
    }
    if (variant === 'chips') {
      return (
        <span className={`inline-flex flex-wrap gap-1.5 ${className}`.trim()}>
          {cleanList.map((val, idx) => (
            <MemberValue
              key={String(val) + '-' + idx}
              value={val}
              variant="chips"
              stopPropagation={stopPropagation}
            />
          ))}
        </span>
      );
    }
    if (variant === 'cell') {
      return (
        <Text variant="body" tone="muted" as="span" className={`block truncate ${className}`.trim()}>
          {cleanList.map((val, idx) => (
            <span key={String(val) + '-' + idx} className="after:content-[',_'] last:after:content-none font-medium">
              <MemberValue
                value={val}
                variant="inline"
                stopPropagation={stopPropagation}
              />
            </span>
          ))}
        </Text>
      );
    }
    return (
      <span className={`inline-flex flex-col gap-2 ${className}`.trim()}>
        {cleanList.map((val, idx) => (
          <MemberValue
            key={String(val) + '-' + idx}
            value={val}
            variant={variant}
            stopPropagation={stopPropagation}
          />
        ))}
      </span>
    );
  }

  if (!userId) {
    return <>{emptyFallback}</>;
  }

  if (loading) {
    return (
      <span className={className}>
        <Skeleton variant={variant} />
      </span>
    );
  }

  if (!label) {
    return <>{emptyFallback}</>;
  }

  const route = memberRoute(workspaceId);
  const linkClass =
    variant === 'cell'
      ? 'text-sm text-[var(--link)] hover:text-[var(--link-hover)] underline underline-offset-2'
      : 'text-[var(--link)] hover:text-[var(--link-hover)] underline underline-offset-2 decoration-[var(--panel-border)] hover:decoration-[var(--link-hover)]';

  const nameNode = route ? (
    <Link
      to={route}
      className={linkClass}
      onClick={stopPropagation ? e => e.stopPropagation() : undefined}
    >
      {label}
    </Link>
  ) : (
    <span>{label}</span>
  );

  if (variant === 'cell') {
    return (
      <Text
        variant="body"
        as="span"
        className={`block max-w-full truncate ${className}`.trim()}
      >
        {nameNode}
      </Text>
    );
  }

  if (variant === 'chips') {
    return (
      <Surface
        as="span"
        tone="panel-2"
        border="none"
        radius="pill"
        className={`inline-flex max-w-full items-center gap-2 px-2 py-0.5 ${className}`.trim()}
      >
        <Avatar
          name={displayName || label}
          size="xs"
          attachmentId={avatarAttachmentId}
        />
        <Text variant="body" as="span" className="min-w-0 truncate">
          {nameNode}
        </Text>
        {email && displayName ? (
          <Text variant="body-sm" tone="muted" as="span" className="hidden truncate sm:inline">
            {email}
          </Text>
        ) : null}
      </Surface>
    );
  }

  return (
    <span className={`inline-flex min-w-0 items-center gap-2 ${className}`.trim()}>
      <AvatarStackedMeta
        className="min-w-0"
        avatar={
          <Avatar
            name={displayName || label}
            size="xs"
            attachmentId={avatarAttachmentId}
          />
        }
        primary={
          <Text variant="body" as="span" className="truncate">{nameNode}</Text>
        }
        secondary={
          email && displayName ? (
            <Text variant="body-sm" tone="muted" as="span" className="truncate">
              {email}
            </Text>
          ) : undefined
        }
      />
    </span>
  );
}
