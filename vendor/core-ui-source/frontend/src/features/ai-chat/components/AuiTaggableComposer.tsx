/**
 * Taggable composer wired to assistant-ui thread composer state.
 */
import { useAui, useAuiState } from "@assistant-ui/react";
import { useCallback, useEffect, useRef, useState } from "react";

import { TaggableComposer } from "../../../components/chat/TaggableComposer";
import { useChatEntityRefsOptional } from "../../../context/ChatEntityRefsContext";
import type { ChatEntityRef } from "../../../types/chatEntityRefs";
import { useChatActivity } from "../AIChatSurface";
import { useComposerDictationActions } from "../../speech/ComposerDictationContext";
import { useAuthOptional } from "../../../context/AuthContext";
import { useScope } from "../../../context/ScopeContext";
import { consumePendingChatInput, OPEN_AI_CHAT_EVENT } from "../chatHandoff";

type AuiTaggableComposerProps = Omit<
  React.TextareaHTMLAttributes<HTMLTextAreaElement>,
  "value" | "onChange"
> & { acceptHandoff?: boolean; onSendAttempt?: () => void };

export function AuiTaggableComposer({
  className,
  style,
  placeholder,
  disabled,
  rows,
  autoFocus,
  "aria-label": ariaLabel,
  acceptHandoff = true,
  onSendAttempt,
}: AuiTaggableComposerProps) {
  const aui = useAui();
  const { scope } = useScope();
  const auth = useAuthOptional();
  const principalId = auth?.user?.id ?? null;
  const { activeThreadId, composerReady, isRunning } = useChatActivity();
  const composerText = useAuiState((s) => s.composer.text ?? "");
  const [localValue, setLocalValue] = useState(composerText);
  // The composer is one box for the whole surface. Switching chats (including
  // New conversation, and the thread created by the first send) must drop the
  // previous draft, or the next message is glued onto it.
  const seenThread = useRef(activeThreadId);
  const [entityRefs, setEntityRefs] = useState<ChatEntityRef[]>([]);
  const submitAfterDictationRef = useRef(false);
  const entityRefsCtx = useChatEntityRefsOptional();
  const dictation = useComposerDictationActions();
  // Read at send time: a send that waits for dictation to finish must see the
  // refs as they are after the last dictated words, not when Enter was hit.
  const entityRefsRef = useRef(entityRefs);
  entityRefsRef.current = entityRefs;

  useEffect(() => {
    setLocalValue(composerText);
  }, [composerText]);

  useEffect(() => {
    if (seenThread.current === activeThreadId) return;
    seenThread.current = activeThreadId;
    setLocalValue("");
    setEntityRefs([]);
    entityRefsCtx?.setPendingEntityRefs([]);
    aui.composer().setText("");
  }, [activeThreadId, aui, entityRefsCtx]);

  useEffect(() => {
    if (!acceptHandoff || !composerReady || isRunning || disabled) return;
    let timer: number | null = null;
    const applyPendingDraft = () => {
      if (timer != null) window.clearTimeout(timer);
      // Apply after the runtime has committed its selected-thread reset.
      // Keep the storage handoff intact while scope/thread selection loads;
      // a slow thread list must not silently consume the user's draft.
      timer = window.setTimeout(() => {
        timer = null;
        const input = consumePendingChatInput();
        if (!input) return;
        // A Home submission belongs to the workspace in which it was clicked.
        // Never send a deferred handoff after the user switches workspace.
        if (input.submit && (!input.workspaceId || input.workspaceId !== scope?.workspaceId || !input.principalId || input.principalId !== principalId)) return;
        setLocalValue(input.text);
        aui.composer().setText(input.text);
        if (input.submit) {
          setEntityRefs([]);
          entityRefsCtx?.setPendingEntityRefs([]);
          entityRefsCtx?.flushPendingEntityRefs();
          void aui.composer().send();
          // Sending resets runtime text synchronously; its value may remain
          // unchanged (empty), so the local controlled value must reset too.
          setLocalValue("");
        }
      }, 0);
    };
    applyPendingDraft();
    window.addEventListener(OPEN_AI_CHAT_EVENT, applyPendingDraft);
    return () => {
      window.removeEventListener(OPEN_AI_CHAT_EVENT, applyPendingDraft);
      if (timer != null) window.clearTimeout(timer);
    };
  }, [acceptHandoff, activeThreadId, aui, composerReady, isRunning, disabled, scope?.workspaceId, principalId, entityRefsCtx]);

  useEffect(() => {
    entityRefsCtx?.registerComposerEntityRefsReset(() => setEntityRefs([]));
    return () => entityRefsCtx?.registerComposerEntityRefsReset(null);
  }, [entityRefsCtx]);

  const handleChange = useCallback(
    (next: string) => {
      setLocalValue(next);
      aui.composer().setText(next);
    },
    [aui],
  );

  const handleEntityRefsChange = useCallback(
    (refs: ChatEntityRef[]) => {
      setEntityRefs(refs);
      entityRefsCtx?.setPendingEntityRefs(refs);
    },
    [entityRefsCtx],
  );

  const sendNow = useCallback(() => {
    entityRefsCtx?.setPendingEntityRefs(entityRefsRef.current);
    entityRefsCtx?.flushPendingEntityRefs();
    onSendAttempt?.();
    void aui.composer().send();
  }, [aui, entityRefsCtx, onSendAttempt]);

  const handleSubmit = useCallback(() => {
    // Finish dictation first so the last words land before the message goes.
    // Stopping for a submit never auto-sends, so this sends exactly once.
    if (dictation?.isListening()) {
      if (submitAfterDictationRef.current) return;
      submitAfterDictationRef.current = true;
      void dictation
        .stop("submit")
        .then(sendNow)
        .finally(() => {
          submitAfterDictationRef.current = false;
        });
      return;
    }
    sendNow();
  }, [dictation, sendNow]);

  useEffect(() => {
    dictation?.registerSubmit(handleSubmit);
    return () => dictation?.registerSubmit(null);
  }, [dictation, handleSubmit]);

  return (
    <TaggableComposer
      ref={dictation?.registerTextarea}
      value={localValue}
      onChange={handleChange}
      entityRefs={entityRefs}
      onEntityRefsChange={handleEntityRefsChange}
      onSubmit={handleSubmit}
      className={className}
      style={style}
      placeholder={placeholder}
      disabled={disabled}
      rows={rows}
      autoFocus={autoFocus}
      aria-label={ariaLabel}
    />
  );
}
