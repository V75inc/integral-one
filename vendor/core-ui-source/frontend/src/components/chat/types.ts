export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system" | "proactive";
  content: string;
  contentType: "text" | "rich" | "card";
  richPayload?: Record<string, unknown>;
  intentData?: Record<string, unknown>;
  graphOperations?: Record<string, unknown>[];
  channel?: string;
  timestamp: string;
}

export type { ConversationContext } from '../../types/conversationContext';

export interface SmartFileResult {
  resolved_track: { id: string; title: string } | null;
  resolved_entry_type: {
    id: string;
    name: string;
    form_schema: Record<string, unknown>;
  } | null;
  suggested_tags: { id: string; name: string; color: string }[];
  extracted_fields: Record<string, unknown>;
  filing_status: "resolved" | "partial" | "unresolved";
  message: string;
}

export interface AgentEvent {
  type: string;
  payload: Record<string, unknown>;
  timestamp: string;
}