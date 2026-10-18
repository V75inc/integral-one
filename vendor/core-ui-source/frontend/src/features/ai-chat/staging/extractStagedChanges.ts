import { coerceToolResult } from './StagedChangeToolUI';
import { isStagedChange, type StagedChange } from './types';

type Toolish = {
  type?: string;
  result?: unknown;
  isError?: boolean;
};

/** Collect staged-change envelopes from assistant message tool-call parts. */
export function extractStagedChangesFromParts(
  content: ReadonlyArray<Toolish> | undefined,
  parts: ReadonlyArray<Toolish> | undefined,
): StagedChange[] {
  const out: StagedChange[] = [];
  const seen = new Set<string>();
  for (const part of [...(content ?? []), ...(parts ?? [])]) {
    if (part?.type !== 'tool-call') continue;
    if (part.isError) continue;
    const coerced = coerceToolResult(part.result);
    if (!coerced || !isStagedChange(coerced)) continue;
    if (seen.has(coerced.token)) continue;
    seen.add(coerced.token);
    out.push(coerced);
  }
  return out;
}
