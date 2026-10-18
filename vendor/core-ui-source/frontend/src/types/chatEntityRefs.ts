/** Entity reference attached to a chat message for agent context. */
export type ChatEntityRefKind = 'user' | 'app' | 'track';

export interface ChatEntityRef {
  kind: ChatEntityRefKind;
  id: string;
  label: string;
  /** Exact @label / #label substring inserted in the message (for multi-word matching). */
  token?: string;
  display_name?: string;
  email?: string;
  /** Parent app name when kind is track (disambiguation in UI). */
  subtitle?: string;
}
