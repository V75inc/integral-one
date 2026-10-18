import { Link } from 'react-router-dom';
import type { ReactNode } from 'react';

import type { ChatEntityRef, ChatEntityRefKind } from '../../types/chatEntityRefs';
import {
  findTagSegments,
  hrefForEntityRef,
  refForToken,
  type TagSegment,
} from './chatEntityTokens';

/** Above floating chat launcher (z-index 1000) and most modals. */
export const CHAT_TAG_POPOVER_Z_INDEX = 10100;

type TokenKind = ChatEntityRefKind | 'unknown';

function tokenClass(kind: TokenKind, trigger: '@' | '#', linkable: boolean): string {
  const base =
    kind === 'user'
      ? 'chat-entity-token chat-entity-token--user'
      : kind === 'app'
        ? 'chat-entity-token chat-entity-token--app'
        : kind === 'track'
          ? 'chat-entity-token chat-entity-token--track'
          : trigger === '@'
            ? 'chat-entity-token chat-entity-token--user-pending'
            : 'chat-entity-token chat-entity-token--resource-pending';
  return linkable ? `${base} chat-entity-token--link` : base;
}

function tokenTitle(
  ref: ChatEntityRef | undefined,
  trigger: '@' | '#',
  body: string,
): string {
  if (!ref) {
    return trigger === '@' ? `Person: ${body}` : `App or track: ${body}`;
  }
  if (ref.kind === 'user') {
    const name = ref.display_name || ref.label;
    return ref.email ? `${name} (${ref.email})` : name;
  }
  if (ref.kind === 'app') return `App: ${ref.label}`;
  return ref.subtitle ? `Track: ${ref.label} · ${ref.subtitle}` : `Track: ${ref.label}`;
}

function renderSegment(
  seg: TagSegment,
  key: number,
  opts: {
    linkable: boolean;
    workspaceId?: string | null;
    entityRefs: ChatEntityRef[];
  },
): ReactNode {
  const ref = seg.ref ?? refForToken(seg.text, opts.entityRefs);
  const kind: TokenKind = ref?.kind ?? 'unknown';
  const className = tokenClass(kind, seg.trigger, opts.linkable && !!ref);
  const title = tokenTitle(ref, seg.trigger, seg.body);

  if (opts.linkable && ref) {
    const href = hrefForEntityRef(ref, opts.workspaceId);
    if (href) {
      return (
        <Link
          key={key}
          to={href}
          className={className}
          title={title}
          onClick={e => e.stopPropagation()}
        >
          {seg.text}
        </Link>
      );
    }
  }

  return (
    <span key={key} className={className} title={title}>
      {seg.text}
    </span>
  );
}

function renderFromSegments(
  text: string,
  segments: TagSegment[],
  opts: {
    linkable: boolean;
    workspaceId?: string | null;
    entityRefs: ChatEntityRef[];
  },
): ReactNode[] {
  const parts: ReactNode[] = [];
  let last = 0;
  let key = 0;
  for (const seg of segments) {
    if (seg.start > last) {
      parts.push(<span key={key++}>{text.slice(last, seg.start)}</span>);
    }
    parts.push(renderSegment(seg, key++, opts));
    last = seg.end;
  }
  if (last < text.length) {
    parts.push(<span key={key++}>{text.slice(last)}</span>);
  }
  return parts;
}

/** Highlight layer mirrored under the textarea (no links). */
export function renderTaggedText(
  text: string,
  entityRefs: ChatEntityRef[],
): ReactNode[] {
  return renderFromSegments(text, findTagSegments(text, entityRefs), {
    linkable: false,
    entityRefs,
  });
}

/** Read-only message body with optional links to app/track (and workspace members for users). */
export function renderTaggedMessageText(
  text: string,
  entityRefs: ChatEntityRef[],
  workspaceId?: string | null,
): ReactNode[] {
  return renderFromSegments(text, findTagSegments(text, entityRefs), {
    linkable: true,
    workspaceId,
    entityRefs,
  });
}
