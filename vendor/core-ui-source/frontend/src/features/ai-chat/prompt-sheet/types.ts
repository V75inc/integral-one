/** Prompt Sheet queue wire types (ChatThread.prompt_queue). */

export type PromptItemStatus =
  | 'pending'
  | 'answered'
  | 'skipped'
  | 'approved'
  | 'rejected'
  | 'cancelled';

export type PromptItemKind = 'question' | 'staged_write';

export interface PromptQuestionItem {
  id: string;
  kind: 'question';
  status: PromptItemStatus;
  created_at?: string;
  resolved_at?: string | null;
  question: string;
  header?: string;
  options: { label: string; description?: string }[];
  allow_other?: boolean;
  multi_select?: boolean;
  answer?: string[] | null;
}

export interface PromptStagedWriteItem {
  id: string;
  kind: 'staged_write';
  status: PromptItemStatus;
  created_at?: string;
  resolved_at?: string | null;
  token: string;
  write_kind?: string;
  summary?: string;
  diff_human?: unknown;
  diff_machine?: unknown;
  staged_state?: string;
  last_error?: { message?: string; error_code?: string };
  completed_operations?: number;
  autonomy_grant_used?: boolean;
  expires_at?: string;
}

export type PromptItem = PromptQuestionItem | PromptStagedWriteItem;

export interface PromptQueue {
  status: 'open' | 'closed';
  opened_at?: string | null;
  closed_at?: string | null;
  close_reason?: string | null;
  items: PromptItem[];
}
