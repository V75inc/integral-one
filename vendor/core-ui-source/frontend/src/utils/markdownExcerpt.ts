/**
 * Rough plain-text excerpt for single-line UI (calendar rows, dashboards).
 * Avoids showing raw markdown markers in `truncate` / one-line layouts.
 */
export function markdownToPlainExcerpt(source: string, maxLen = 200): string {
  const s = String(source || '')
    .replace(/\r\n/g, '\n')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/_([^_]+)_/g, '$1')
    .replace(/~~([^~]+)~~/g, '$1')
    .replace(/^\s*[-*+]\s+/gm, '')
    .replace(/^\s*\d+\.\s+/gm, '')
    .replace(/\n+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (s.length <= maxLen) return s;
  return `${s.slice(0, maxLen)}…`;
}
