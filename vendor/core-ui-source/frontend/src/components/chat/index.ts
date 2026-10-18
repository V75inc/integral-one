// The legacy chat shell (ChatShell/ChatThread/ChatInput/ChatSuggestions/
// ChatContextBar/ChatMessage) was removed with the unrouted /chat page; the
// live assistant surface lives under features/ai-chat. Only the shared types
// remain exported from here.
export type {
  ChatMessage as ChatMessageType,
  ConversationContext,
  SmartFileResult,
  AgentEvent,
} from "./types";
