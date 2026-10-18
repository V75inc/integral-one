export interface MarkdownHeading {
  id: string;
  level: 1 | 2 | 3;
  text: string;
}

function slugifyHeading(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'section';
}

/** Extract h1–h3 headings from markdown for an in-doc table of contents. */
export function extractMarkdownHeadings(markdown: string): MarkdownHeading[] {
  const headings: MarkdownHeading[] = [];
  const seen = new Map<string, number>();
  const lines = markdown.split('\n');

  for (const line of lines) {
    const match = /^(#{1,3})\s+(.+)$/.exec(line.trim());
    if (!match) continue;
    const level = match[1].length as 1 | 2 | 3;
    const text = match[2].replace(/\s+#+\s*$/, '').trim();
    if (!text) continue;
    const base = slugifyHeading(text);
    const count = seen.get(base) ?? 0;
    seen.set(base, count + 1);
    const id = count === 0 ? base : `${base}-${count}`;
    headings.push({ id, level, text });
  }
  return headings;
}
