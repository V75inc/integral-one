import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';

import { readStyleAttribute } from './styleAttribute';

const MSO_CLASS_STYLE =
  /(?:^|[\s,>+~])(?:p|li|div|span|h[1-6]|td|th|table|tr)\.([A-Za-z0-9_-]+)\s*\{([^}]+)\}/gi;

const BLOCK_HOIST_TAGS = new Set([
  'P',
  'H1',
  'H2',
  'H3',
  'H4',
  'H5',
  'H6',
  'LI',
  'TD',
  'TH',
]);

const INLINE_TYPO_PROPS = new Set([
  'font-size',
  'font-family',
  'color',
  'background-color',
  'font-weight',
  'font-style',
  'text-decoration',
  'letter-spacing',
]);

const INLINE_WRAP_TAGS = new Set([
  'SPAN',
  'B',
  'STRONG',
  'I',
  'EM',
  'U',
  'S',
  'A',
  'MARK',
  'SUB',
  'SUP',
]);

function stripCssComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, '');
}

/** Collect CSS from all ``<style>`` blocks (including inside Word conditional comments). */
export function extractStyleBlocks(html: string): string {
  const parts: string[] = [];
  const re = /<style[^>]*>([\s\S]*?)<\/style>/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(html)) !== null) {
    parts.push(match[1]);
  }
  return parts.join('\n');
}

function parseOfficeClassRules(styleText: string): Map<string, string> {
  const classStyles = new Map<string, string>();
  const cleaned = stripCssComments(styleText);
  let match: RegExpExecArray | null;
  const re = MSO_CLASS_STYLE;
  re.lastIndex = 0;
  while ((match = re.exec(cleaned)) !== null) {
    const cls = match[1];
    const body = normalizeMsoCssDeclarations(match[2])
      .replace(/\s+/g, ' ')
      .replace(/;\s*$/, '')
      .trim();
    if (!body) continue;
    const prev = classStyles.get(cls);
    classStyles.set(cls, prev ? `${prev};${body}` : body);
  }
  const bareRe = /\.([A-Za-z0-9_-]+)\s*\{([^}]+)\}/gi;
  bareRe.lastIndex = 0;
  while ((match = bareRe.exec(cleaned)) !== null) {
    const cls = match[1];
    if (cls.startsWith('@')) continue;
    const body = normalizeMsoCssDeclarations(match[2])
      .replace(/\s+/g, ' ')
      .replace(/;\s*$/, '')
      .trim();
    if (!body || classStyles.has(cls)) continue;
    classStyles.set(cls, body);
  }
  return classStyles;
}

function normalizeMsoCssDeclarations(css: string): string {
  return css
    .replace(/mso-ansi-font-size\s*:\s*([^;]+)/gi, 'font-size:$1')
    .replace(/mso-bidi-font-size\s*:\s*([^;]+)/gi, 'font-size:$1')
    .replace(/\bfont-family\s*:\s*([^;]+)/gi, (_, fonts) => {
      const first = String(fonts).split(',')[0]?.replace(/['"]+/g, '').trim();
      return first ? `font-family:${first}` : `font-family:${fonts}`;
    })
    .replace(/mso-[^:;]+:\s*[^;]+;?/gi, '')
    .replace(/tab-stops:[^;]+;?/gi, '')
    .replace(/layout-grid-mode:[^;]+;?/gi, '');
}

function parseInlineStyle(style: string): Map<string, string> {
  const map = new Map<string, string>();
  for (const part of style.split(';')) {
    const idx = part.indexOf(':');
    if (idx === -1) continue;
    const key = part.slice(0, idx).trim().toLowerCase();
    const val = part.slice(idx + 1).trim();
    if (key && val) map.set(key, val);
  }
  return map;
}

function stringifyInlineStyle(map: Map<string, string>): string {
  return Array.from(map.entries())
    .map(([k, v]) => `${k}:${v}`)
    .join(';');
}

function mergeInlineStyle(el: HTMLElement, extra: string) {
  if (!extra.trim()) return;
  const merged = new Map<string, string>(parseInlineStyle(el.getAttribute('style') || ''));
  for (const [k, v] of parseInlineStyle(extra)) merged.set(k, v);
  el.setAttribute('style', stringifyInlineStyle(merged));
}

function normalizeElementStyle(el: HTMLElement) {
  const raw = el.getAttribute('style');
  if (!raw) return;
  el.setAttribute('style', normalizeMsoCssDeclarations(raw));
}

function applyLegacyAlign(el: HTMLElement) {
  const align = el.getAttribute('align')?.trim().toLowerCase();
  if (!align) return;
  if (['left', 'center', 'right', 'justify'].includes(align)) {
    mergeInlineStyle(el, `text-align:${align}`);
  }
  el.removeAttribute('align');
}

function hoistBlockTypography(el: HTMLElement) {
  if (!BLOCK_HOIST_TAGS.has(el.tagName)) return;

  const blockStyle = parseInlineStyle(el.getAttribute('style') || '');
  const hoist = new Map<string, string>();
  for (const [key, val] of blockStyle) {
    if (INLINE_TYPO_PROPS.has(key)) {
      hoist.set(key, val);
      blockStyle.delete(key);
    }
  }
  if (hoist.size === 0) return;

  el.setAttribute('style', stringifyInlineStyle(blockStyle));

  const applyHoistToInline = (node: HTMLElement) => {
    const childStyle = parseInlineStyle(node.getAttribute('style') || '');
    for (const [k, v] of hoist) {
      if (!childStyle.has(k)) childStyle.set(k, v);
    }
    node.setAttribute('style', stringifyInlineStyle(childStyle));
  };

  const walk = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent ?? '';
      if (!text.replace(/\u00a0/g, ' ').trim()) return;
      const span = el.ownerDocument.createElement('span');
      span.setAttribute('style', stringifyInlineStyle(hoist));
      span.textContent = text;
      node.parentNode?.replaceChild(span, node);
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const child = node as HTMLElement;
    if (child.tagName === 'BR') return;
    if (INLINE_WRAP_TAGS.has(child.tagName)) {
      applyHoistToInline(child);
      return;
    }
    Array.from(child.childNodes).forEach(walk);
  };

  Array.from(el.childNodes).forEach(walk);
}

function replaceFontTags(root: ParentNode) {
  root.querySelectorAll('font').forEach(font => {
    const span = font.ownerDocument.createElement('span');
    const styles: string[] = [];
    const face = font.getAttribute('face');
    const color = font.getAttribute('color');
    const size = font.getAttribute('size');
    if (face) styles.push(`font-family:${face}`);
    if (color) styles.push(`color:${color}`);
    if (size) {
      const n = parseInt(size, 10);
      if (Number.isFinite(n)) {
        const ptMap = [0, 8, 10, 12, 14, 18, 24, 36];
        const pt = ptMap[Math.min(7, Math.max(1, n))];
        if (pt) styles.push(`font-size:${pt}pt`);
      }
    }
    mergeInlineStyle(span, styles.join(';'));
    mergeInlineStyle(span, font.getAttribute('style') || '');
    span.innerHTML = font.innerHTML;
    font.replaceWith(span);
  });
}

function unwrapEmptyOfficeNodes(root: ParentNode) {
  root.querySelectorAll('o\\:p, o:p').forEach(node => {
    const el = node as HTMLElement;
    if (!el.textContent?.trim()) {
      el.remove();
    } else {
      const span = el.ownerDocument.createElement('span');
      span.innerHTML = el.innerHTML;
      el.replaceWith(span);
    }
  });
}

/** Normalize clipboard HTML from Word, Google Docs, and browsers for TipTap parsing. */
export function normalizePastedHtml(html: string): string {
  if (!html?.trim()) return html;

  const embeddedCss = extractStyleBlocks(html);
  const classStyles = parseOfficeClassRules(embeddedCss);

  const raw = html
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<\?xml[\s\S]*?\?>/gi, '')
    .replace(/<meta[^>]*>/gi, '');

  const doc = new DOMParser().parseFromString(raw, 'text/html');
  if (!doc.body) return html;

  doc.querySelectorAll('style, link[rel="stylesheet"]').forEach(s => s.remove());

  doc.body.querySelectorAll('*').forEach(node => {
    normalizeElementStyle(node as HTMLElement);
  });

  doc.body.querySelectorAll('[class]').forEach(node => {
    const el = node as HTMLElement;
    const classes = el.className.split(/\s+/).filter(Boolean);
    const chunks: string[] = [];
    for (const cls of classes) {
      const rule = classStyles.get(cls);
      if (rule) chunks.push(rule);
    }
    if (chunks.length) mergeInlineStyle(el, chunks.join(';'));
    el.removeAttribute('class');
  });

  doc.body.querySelectorAll('[align]').forEach(node => {
    applyLegacyAlign(node as HTMLElement);
  });

  replaceFontTags(doc.body);
  unwrapEmptyOfficeNodes(doc.body);

  doc.body.querySelectorAll('div').forEach(div => {
    const el = div as HTMLElement;
    if (el.querySelector('table')) return;
    const p = doc.createElement('p');
    mergeInlineStyle(p, el.getAttribute('style') || '');
    p.innerHTML = el.innerHTML;
    el.replaceWith(p);
  });

  doc.body.querySelectorAll('p, h1, h2, h3, h4, h5, h6, li, td, th').forEach(node => {
    hoistBlockTypography(node as HTMLElement);
  });

  return doc.body.innerHTML;
}

/** Parse ``text-align`` from the raw style attribute (Word / Docs paste). */
export const BlockTextAlignFromStyle = Extension.create({
  name: 'blockTextAlignFromStyle',
  priority: 200,
  addGlobalAttributes() {
    const types = ['heading', 'paragraph', 'blockquote', 'tableCell', 'tableHeader'];
    return [
      {
        types,
        attributes: {
          textAlign: {
            parseHTML: element => {
              const el = element as HTMLElement;
              const fromAttr = readStyleAttribute(el, 'text-align');
              const val = (fromAttr || el.style.textAlign || '').trim().toLowerCase();
              if (['left', 'center', 'right', 'justify'].includes(val)) return val;
              return null;
            },
          },
        },
      },
    ];
  },
});

export const PreservePasteFormatting = Extension.create({
  name: 'preservePasteFormatting',
  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey('preservePasteFormatting'),
        props: {
          transformPastedHTML(html) {
            return normalizePastedHtml(html);
          },
        },
      }),
    ];
  },
});
