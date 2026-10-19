import { describe, expect, it } from 'vitest';
import { extractMarkdownHeadings } from '../extractMarkdownHeadings';

describe('extractMarkdownHeadings', () => {
  it('extracts h1–h3 in document order', () => {
    const md = `# Intro\n\n## Setup\n\n### Step one\n\n## FAQ`;
    const headings = extractMarkdownHeadings(md);
    expect(headings.map(h => h.text)).toEqual(['Intro', 'Setup', 'Step one', 'FAQ']);
    expect(headings.map(h => h.level)).toEqual([1, 2, 3, 2]);
  });
});
