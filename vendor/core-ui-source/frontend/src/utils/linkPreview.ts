export function extractFirstUrl(text: string): string | null {
  const match = String(text || '').match(/https?:\/\/[^\s)]+/i);
  return match?.[0] || null;
}
