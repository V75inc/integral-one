import { describe, expect, it } from 'vitest';
import { parseCsv } from '../csvParse';

describe('parseCsv', () => {
  it('splits rows and fields', () => {
    expect(parseCsv('a,b\n1,2\n')).toEqual([['a', 'b'], ['1', '2']]);
  });
  it('keeps commas, newlines and doubled quotes inside quoted fields', () => {
    expect(parseCsv('a,b\n"x, y","he said ""hi""\nthere"\r\n')).toEqual([['a', 'b'], ['x, y', 'he said "hi"\nthere']]);
  });
  it('keeps empty trailing cells and survives a stray quote', () => {
    expect(parseCsv("1,,'11/2026,\"45 Camp\",,")).toEqual([['1', '', "'11/2026", '45 Camp', '', '']]);
  });
  it('stops at the row limit', () => {
    expect(parseCsv('a\nb\nc\nd', 2)).toHaveLength(2);
  });
});
