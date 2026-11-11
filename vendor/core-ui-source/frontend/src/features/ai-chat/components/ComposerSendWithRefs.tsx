import { useAui, useAuiState } from "@assistant-ui/react";
import { ArrowUpIcon } from "lucide-react";
import { HoverTooltip } from "../../../components/ui/HoverTooltip";

import { useChatEntityRefsOptional } from "../../../context/ChatEntityRefsContext";
import { useComposerDictationActions } from "../../speech/ComposerDictationContext";
import { chatMessageTooLong } from "../messageLength";

/** Send after dictation settles and entity refs are flushed to the outgoing turn. */
export function ComposerSendWithRefs({
  className,
  "aria-label": ariaLabel = "Send message",
  label,
  queue = false,
}: {
  className?: string;
  "aria-label"?: string;
  label?: string;
  queue?: boolean;
}) {
  const aui = useAui();
  const canSend = useAuiState((s) => queue
    ? Boolean(s.composer.text.trim()) && s.composer.attachments.length === 0
    : s.composer.canSend);
  const messageTooLong = useAuiState((s) => chatMessageTooLong(s.composer.text));
  const entityRefsCtx = useChatEntityRefsOptional();
  const dictation = useComposerDictationActions();

  return (
    <HoverTooltip label={ariaLabel} placement="top"><button
      type="button"
      aria-label={ariaLabel}
      title={ariaLabel}
      className={className}
      disabled={!canSend || messageTooLong}
      onClick={() => {
        if (chatMessageTooLong(aui.composer().getState().text)) return;
        if (dictation) {
          dictation.submit();
          return;
        }
        entityRefsCtx?.flushPendingEntityRefs();
        aui.composer().send();
      }}
    >
      <ArrowUpIcon size={16} strokeWidth={2.5} />
      {label}
    </button></HoverTooltip>
  );
}
