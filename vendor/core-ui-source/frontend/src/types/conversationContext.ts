/** Agent conversation context — shared between API client and chat UI. */

export interface ConversationContext {
  id: string;
  agentType: string;
  agentConversationId: string;
  userId: string;
  focusedTrackId?: string | null;
  focusedAppId?: string | null;
  entitiesReferenced: Record<string, unknown>[];
}
