import DOMPurify from 'dompurify';

/** Sanitize header/footer HTML while keeping inline typography (font-size, color, etc.). */
export function sanitizeLetterheadHtml(html: string): string {
  return DOMPurify.sanitize(html, {
    USE_PROFILES: { html: true },
    ADD_ATTR: ['style', 'data-layout'],
  });
}
