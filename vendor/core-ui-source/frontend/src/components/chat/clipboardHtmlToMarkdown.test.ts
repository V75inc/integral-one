import { describe, expect, it } from 'vitest';
import { clipboardHtmlToMarkdown } from './clipboardHtmlToMarkdown';

describe('clipboardHtmlToMarkdown', () => {
  it('keeps nested list items nested and honors ordered starts', () => {
    expect(clipboardHtmlToMarkdown('<ol start="3"><li>Parent<ul><li>Child</li></ul></li><li>Next</li></ol>'))
      .toBe('3. Parent\n   - Child\n4. Next');
  });
  it('preserves whitespace outside inline formatting delimiters', () => {
    expect(clipboardHtmlToMarkdown('<p><b>Ready </b>now <i> please</i></p>'))
      .toBe('**Ready** now  *please*');
  });
});

it('preserves code fences and intentional blank lines', () => {
  expect(clipboardHtmlToMarkdown('<pre>  first\n\n\n```\nlast\n</pre>'))
    .toBe('````\n  first\n\n\n```\nlast\n````');
});

it('preserves inline styles from document clipboards and literal Markdown text', () => {
  expect(clipboardHtmlToMarkdown('<span style="font-weight:700">Ready</span> *literally*'))
    .toBe('**Ready** \\*literally\\*');
  expect(clipboardHtmlToMarkdown('<a href="https://example.com/a(b)">Open</a>'))
    .toBe('[Open](https://example.com/a%28b%29)');
});

it('honors document clipboard style resets on semantic wrapper elements', () => {
  expect(clipboardHtmlToMarkdown('<b style="font-weight:normal"><p>Ordinary text</p><p><span style="font-weight:700">Important</span></p></b>'))
    .toBe('Ordinary text\n\n**Important**');
  expect(clipboardHtmlToMarkdown('<i style="font-style:normal">Ordinary</i>'))
    .toBe('Ordinary');
});

it('preserves document sibling lists and unexpected readable list children in order', () => {
  expect(clipboardHtmlToMarkdown('<ol><li>Parent</li><ul><li>Nested text</li></ul><li>Next</li></ol>'))
    .toBe('1. Parent\n   - Nested text\n2. Next');
  const result = clipboardHtmlToMarkdown('<ol><li>First</li><div>Do not lose this</div><li value="7">Last</li></ol>');
  expect(result).toContain('Do not lose this');
  expect(result).toContain('7. Last');
  expect(result.indexOf('Do not lose this')).toBeGreaterThan(result.indexOf('First'));
  expect(result.indexOf('Do not lose this')).toBeLessThan(result.indexOf('Last'));
});
