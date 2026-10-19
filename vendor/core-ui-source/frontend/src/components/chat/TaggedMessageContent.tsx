import { useScope } from '../../context/ScopeContext';
import type { ChatEntityRef } from '../../types/chatEntityRefs';
import { normalizeEntityRefs } from './chatEntityTokens';
import { renderTaggedMessageText } from './renderTaggedText';

interface TaggedMessageContentProps {
  text: string;
  entityRefs?: ChatEntityRef[];
  className?: string;
}

/** Renders message body with linked, highlighted @ / # tokens. */
export function TaggedMessageContent({
  text,
  entityRefs = [],
  className = '',
}: TaggedMessageContentProps) {
  const { scope } = useScope();
  const workspaceId = scope?.workspaceId ?? null;
  const refs = normalizeEntityRefs(entityRefs);

  return (
    <span className={`tagged-message-content whitespace-pre-wrap [overflow-wrap:anywhere] ${className}`.trim()}>
      {renderTaggedMessageText(text, refs, workspaceId)}
    </span>
  );
}
