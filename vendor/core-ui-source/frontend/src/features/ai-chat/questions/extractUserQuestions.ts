import { coerceToolResult } from '../staging/StagedChangeToolUI';
import { isUserQuestion, type UserQuestion } from './types';

type Toolish = {
  type?: string;
  result?: unknown;
  isError?: boolean;
};

/**
 * Collect clarifying-question envelopes from an assistant message's tool-call
 * parts. Same scan `extractStagedChangesFromParts` performs — the tool result
 * arrives JSON-stringified from native provider's executor, so it needs coercing
 * before the guard can see it.
 *
 * Deduped by `question_id`: a message can carry the same envelope in both
 * `content` and `parts`, and rendering the card twice would let the user
 * answer the same question two ways.
 */
export function extractUserQuestionsFromParts(
  content: ReadonlyArray<Toolish> | undefined,
  parts: ReadonlyArray<Toolish> | undefined,
): UserQuestion[] {
  const out: UserQuestion[] = [];
  const seen = new Set<string>();
  for (const part of [...(content ?? []), ...(parts ?? [])]) {
    if (part?.type !== 'tool-call') continue;
    if (part.isError) continue;
    const coerced = coerceToolResult(part.result);
    if (!coerced || !isUserQuestion(coerced)) continue;
    if (seen.has(coerced.question_id)) continue;
    seen.add(coerced.question_id);
    out.push(coerced);
  }
  return out;
}
