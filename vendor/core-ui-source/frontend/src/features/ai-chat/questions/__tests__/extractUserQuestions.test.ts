/**
 * The guard is the safety boundary for the whole feature: every assistant
 * tool-call result is run through it, so a loose check would swallow an
 * unrelated tool's output into a question card, and a broken option shape
 * would render `[object Object]` on a button.
 */

import { describe, expect, it } from 'vitest';

import { extractUserQuestionsFromParts } from '../extractUserQuestions';
import { isUserQuestion } from '../types';

const QUESTION = {
  _kind: 'user_question',
  question_id: 'q1',
  question: 'Rebuild or extend?',
  options: [{ label: 'Rebuild' }, { label: 'Extend', description: 'Keep data' }],
  state: 'pending',
};

const part = (result: unknown, extra: Record<string, unknown> = {}) => ({
  type: 'tool-call',
  result,
  ...extra,
});

describe('isUserQuestion', () => {
  it('accepts a well-formed envelope', () => {
    expect(isUserQuestion(QUESTION)).toBe(true);
  });

  it('rejects anything without the sentinel', () => {
    expect(isUserQuestion({ ...QUESTION, _kind: 'staged_change' })).toBe(false);
    expect(isUserQuestion({ question: 'x', options: [] })).toBe(false);
    expect(isUserQuestion(null)).toBe(false);
    expect(isUserQuestion('a string')).toBe(false);
  });

  it('rejects an empty or malformed option list', () => {
    expect(isUserQuestion({ ...QUESTION, options: [] })).toBe(false);
    expect(isUserQuestion({ ...QUESTION, options: 'Rebuild' })).toBe(false);
    // A non-string label would render as [object Object] on a button.
    expect(isUserQuestion({ ...QUESTION, options: [{ label: 42 }] })).toBe(false);
  });
});

describe('extractUserQuestionsFromParts', () => {
  it('reads the envelope whether it arrives as an object or JSON string', () => {
    // native provider's executor stringifies non-string tool returns, so the string
    // form is the one that actually shows up in production.
    const fromObject = extractUserQuestionsFromParts([part(QUESTION)], undefined);
    const fromString = extractUserQuestionsFromParts(
      [part(JSON.stringify(QUESTION))],
      undefined,
    );
    expect(fromObject).toHaveLength(1);
    expect(fromString).toHaveLength(1);
    expect(fromString[0].question).toBe('Rebuild or extend?');
  });

  it('dedupes by question_id across content and parts', () => {
    // The same envelope commonly appears in both; rendering twice would let
    // the user answer one question two different ways.
    const found = extractUserQuestionsFromParts([part(QUESTION)], [part(QUESTION)]);
    expect(found).toHaveLength(1);
  });

  it('ignores errored tool calls and non-tool parts', () => {
    expect(
      extractUserQuestionsFromParts([part(QUESTION, { isError: true })], undefined),
    ).toHaveLength(0);
    expect(
      extractUserQuestionsFromParts([{ type: 'text', result: QUESTION }], undefined),
    ).toHaveLength(0);
  });

  it('leaves other structured tool results alone', () => {
    const staged = { _kind: 'staged_change', token: 't1', kind: 'create_entry' };
    expect(extractUserQuestionsFromParts([part(staged)], undefined)).toHaveLength(0);
  });
});
