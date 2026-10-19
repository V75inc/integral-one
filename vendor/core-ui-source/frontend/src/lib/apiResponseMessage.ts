/** Read the public API error message without rendering structured validation data. */
export function apiResponseMessage(error: unknown, fallback: string): string {
  const data = (error as { response?: { data?: unknown } } | null)?.response?.data;
  if (data === null || typeof data !== 'object') return fallback;
  const body = data as { message?: unknown; error?: { message?: unknown } | null; detail?: unknown };
  for (const message of [body.message, body.error?.message, body.detail]) {
    if (typeof message === 'string' && message.trim()) return message.trim();
  }
  return fallback;
}
