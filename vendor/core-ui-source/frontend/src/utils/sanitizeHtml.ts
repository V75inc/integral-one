import DOMPurify from 'dompurify';

/** Sanitize HTML before injecting via dangerouslySetInnerHTML (Office previews). */
export function sanitizeHtml(html: string): string {
  return DOMPurify.sanitize(html, {
    USE_PROFILES: { html: true },
  });
}
