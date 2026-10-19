import { useCallback, useEffect, useRef } from 'react';
import { useAuiState } from '@assistant-ui/react';
import { Text } from '../../../ui';
import { AIChatRuntimeBoundary, useChatActivity } from '../AIChatSurface';
import { useActiveChatProvider } from '../useActiveChatProvider';
import { requestOpenCompanionChat } from '../chatHandoff';
import { Composer } from './Thread';

/** Home sends through the same upload, dictation, and reference-aware runtime. */
export function HomeChatComposer({ workspaceId, principalId }: {
  workspaceId: string | null;
  principalId: string | null;
}) {
  const provider = useActiveChatProvider();
  if (!workspaceId || !principalId) {
    return <Text tone="muted">Choose a workspace to ask Integral.</Text>;
  }
  return <AIChatRuntimeBoundary key={`${principalId}:${workspaceId}`} provider={provider} startNewThread handoffEnabled={false}>
    <HomeComposerBody />
  </AIChatRuntimeBoundary>;
}

export function HomeComposerBody() {
  const { activeThreadId } = useChatActivity();
  const userMessageCount = useAuiState(s => s.thread.messages.filter(m => m.role === 'user').length);
  const pendingSend = useRef<number | null>(null);
  const onSendAttempt = useCallback(() => { pendingSend.current = userMessageCount; }, [userMessageCount]);
  useEffect(() => {
    // Uploading a file can create the thread. Open the dock only after a send
    // adds its user message; an attachment or a starter alone must not send.
    if (pendingSend.current === null || userMessageCount <= pendingSend.current || !activeThreadId || activeThreadId.startsWith('local-')) return;
    pendingSend.current = null;
    requestOpenCompanionChat({ threadId: activeThreadId });
  }, [activeThreadId, userMessageCount]);
  return <div data-chat-surface="home">
    <Composer home onSendAttempt={onSendAttempt} />

  </div>;
}
