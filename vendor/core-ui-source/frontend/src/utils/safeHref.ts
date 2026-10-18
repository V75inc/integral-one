/** Allow only safe link schemes in user-authored markdown. */
export function isSafeHref(href: string | undefined): boolean {
  if (!href) return false;
  const trimmed = href.trim();
  if (!trimmed) return false;
  if (trimmed.startsWith('/') && !trimmed.startsWith('//')) return true;
  try {
    const url = new URL(trimmed, 'https://example.invalid');
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

export function sanitizeMarkdownHref(href: string | undefined): string | undefined {
  return isSafeHref(href) ? href!.trim() : undefined;
}
