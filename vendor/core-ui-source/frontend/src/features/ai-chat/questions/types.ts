/**
 * Clarifying questions the resident puts to the user.
 *
 * `integral_ask_user` returns this envelope as its tool result; the chat
 * surface renders it as a card with clickable options. Mirrors the
 * `staged_change` contract — a `_kind` sentinel plus a conservative type
 * guard — so an unrecognised shape degrades to the raw-JSON tool disclosure
 * rather than rendering a broken card.
 */

export interface UserQuestionOption {
  /** Button text. */
  label: string;
  /** One line on what the choice means or costs. May be empty. */
  description?: string;
}

export interface UserQuestion {
  _kind: 'user_question';
  question_id: string;
  question: string;
  options: UserQuestionOption[];
  /** Short category chip, e.g. "Approach". May be empty. */
  header?: string;
  /** When true the choices are not mutually exclusive. */
  multi_select?: boolean;
  state: 'pending' | 'answered';
}

/**
 * Type guard for tool-call results.
 *
 * Conservative on purpose: a false positive would swallow an unrelated tool
 * output into a question card. `_kind` is authoritative; the rest is
 * defense-in-depth against API drift. `options` is checked element-wise
 * because a card with a non-string label renders `[object Object]` on a
 * button, which is worse than not rendering the card at all.
 */
export function isUserQuestion(result: unknown): result is UserQuestion {
  if (!result || typeof result !== 'object') return false;
  const r = result as Record<string, unknown>;
  if (r._kind !== 'user_question') return false;
  if (
    typeof r.question_id !== 'string' ||
    typeof r.question !== 'string' ||
    typeof r.state !== 'string'
  ) {
    return false;
  }
  if (!Array.isArray(r.options) || r.options.length === 0) return false;
  return r.options.every(
    (o) => o && typeof o === 'object' && typeof (o as UserQuestionOption).label === 'string',
  );
}
