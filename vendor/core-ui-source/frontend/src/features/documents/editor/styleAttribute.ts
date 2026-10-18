/** Read a CSS property from an element's raw ``style`` attribute (paste-safe). */
export function readStyleAttribute(el: HTMLElement, prop: string): string | null {
  const attr = el.getAttribute('style');
  if (attr) {
    const re = new RegExp(`${prop}\\s*:\\s*([^;]+)`, 'i');
    const match = attr.match(re);
    if (match?.[1]) return match[1].trim();
  }
  const viaDom = el.style.getPropertyValue(prop);
  return viaDom?.trim() || null;
}

export function firstFontFamily(value: string | null): string | null {
  if (!value) return null;
  const first = value.split(',')[0]?.replace(/['"]+/g, '').trim();
  return first || null;
}
