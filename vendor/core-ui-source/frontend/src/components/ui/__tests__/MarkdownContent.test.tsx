import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';

import { MarkdownContent } from '../MarkdownContent';

function renderMarkdown(source: string) {
  return renderToStaticMarkup(
    <MemoryRouter><MarkdownContent>{source}</MarkdownContent></MemoryRouter>,
  );
}

describe('MarkdownContent literal text review', () => {
  it('wraps complete plain text without rendering embedded markup', () => {
    const url = 'https://example.com/' + 'source-path/'.repeat(20);
    const html = renderMarkdown('```text\n# Prior brief\n' + url + '\n```');
    expect(html).toContain('language-text');
    expect(html).toContain('whitespace-pre-wrap break-words');
    expect(html).toContain(url);
    expect(html).toContain('# Prior brief');
    expect(html).not.toContain('<h1');
    expect(html).not.toContain('<a ');
  });

  it('retains source code formatting for other languages', () => {
    const html = renderMarkdown('```python\nprint("hello")\n```');
    expect(html).toContain('language-python');
    expect(html).toContain('whitespace-pre');
    expect(html).not.toContain('whitespace-pre-wrap');
  });
});
