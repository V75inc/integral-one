import { describe, expect, it } from 'vitest';

import {
  applyFinal,
  applyInterim,
  beginDictation,
  committedText,
  tokenRangesOf,
} from '../insertTranscript';

describe('insertTranscript', () => {
  it('opens a region at the caret without changing the text', () => {
    const { value, anchor } = beginDictation('hello', 5, 5);
    expect(value).toBe('hello');
    expect(anchor).toEqual({ start: 5, committedLen: 0, interimLen: 0 });
  });

  it('replaces a selection', () => {
    const { value, anchor } = beginDictation('hello world', 6, 11);
    expect(value).toBe('hello ');
    expect(anchor.start).toBe(6);
  });

  it('moves a caret inside a mention to the end of the token', () => {
    const text = 'hi @alice there';
    expect(tokenRangesOf(text)).toEqual([[3, 9]]);
    expect(beginDictation(text, 5, 5).anchor.start).toBe(9);
  });

  it('writes interim text in place and replaces it on every update', () => {
    const begun = beginDictation('hello', 5, 5);
    let edit = applyInterim(begun.value, begun.anchor, 'wor');
    expect(edit.value).toBe('hello wor');
    expect(edit.caret).toBe(9);
    edit = applyInterim(edit.value, edit.anchor, 'world');
    expect(edit.value).toBe('hello world');
    edit = applyInterim(edit.value, edit.anchor, '');
    expect(edit.value).toBe('hello');
  });

  it('commits finals and continues after them', () => {
    const begun = beginDictation('hello', 5, 5);
    let edit = applyInterim(begun.value, begun.anchor, 'wor');
    edit = applyFinal(edit.value, edit.anchor, 'world');
    expect(edit.value).toBe('hello world');
    expect(edit.anchor.interimLen).toBe(0);
    edit = applyInterim(edit.value, edit.anchor, 'again');
    expect(edit.value).toBe('hello world again');
    expect(committedText(edit.value, edit.anchor)).toBe('world');
  });

  it('puts no space before punctuation', () => {
    const begun = beginDictation('hello', 5, 5);
    expect(applyFinal(begun.value, begun.anchor, ',').value).toBe('hello,');
  });

  it('keeps dictated words apart from the text after the caret', () => {
    const begun = beginDictation('abcdef', 3, 3);
    let edit = applyFinal(begun.value, begun.anchor, 'hello');
    expect(edit.value).toBe('abc hello def');
    edit = applyFinal(edit.value, edit.anchor, 'world');
    expect(edit.value).toBe('abc hello world def');
  });

  it('starts an empty composer without a leading space', () => {
    const begun = beginDictation('', 0, 0);
    expect(applyFinal(begun.value, begun.anchor, 'Hi there').value).toBe('Hi there');
  });
});
