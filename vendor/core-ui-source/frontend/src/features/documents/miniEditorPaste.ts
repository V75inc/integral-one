import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';

import { normalizePastedHtml } from './editor/pasteFormatting';
import { MINI_EDITOR_MAX_IMAGE_BYTES } from './miniEditorExtensions';

function isUsableImageSrc(src: string): boolean {
  if (!src.trim()) return false;
  if (src.startsWith('file:') || src.startsWith('cid:')) return false;
  return (
    src.startsWith('data:image/') ||
    src.startsWith('blob:') ||
    src.startsWith('http://') ||
    src.startsWith('https://')
  );
}

/** Approximate decoded byte size of a data URL payload. */
export function dataUrlPayloadBytes(src: string): number {
  if (!src.startsWith('data:')) return 0;
  const comma = src.indexOf(',');
  if (comma === -1) return src.length;
  const meta = src.slice(0, comma);
  const data = src.slice(comma + 1);
  if (meta.includes(';base64')) {
    return Math.floor((data.replace(/\s/g, '').length * 3) / 4);
  }
  return encodeURIComponent(data).replace(/%[A-F\d]{2}/gi, 'u').length;
}

function stripOversizedDataUrlImages(root: ParentNode): number {
  let removed = 0;
  root.querySelectorAll('img').forEach(img => {
    const src = img.getAttribute('src') || '';
    if (src.startsWith('data:') && dataUrlPayloadBytes(src) > MINI_EDITOR_MAX_IMAGE_BYTES) {
      img.remove();
      removed += 1;
    }
  });
  return removed;
}

function flattenHeadings(root: ParentNode, doc: Document) {
  root.querySelectorAll('h1, h2, h3, h4, h5, h6').forEach(node => {
    const h = node as HTMLElement;
    const p = doc.createElement('p');
    const style = h.getAttribute('style');
    if (style) p.setAttribute('style', style);
    p.innerHTML = h.innerHTML;
    h.replaceWith(p);
  });
}

function cellTextTrim(cell: HTMLElement): string {
  return (cell.textContent ?? '').replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
}

function isEmptyRuleParagraph(el: HTMLElement): boolean {
  const style = (el.getAttribute('style') || '').toLowerCase();
  if (!/border-bottom|border-top|mso-border/i.test(style)) return false;
  return !cellTextTrim(el);
}

function appendCellContent(cell: HTMLElement, target: HTMLElement, doc: Document) {
  const nestedTable = cell.querySelector(':scope > table');
  if (
    nestedTable instanceof HTMLTableElement &&
    nestedTable.rows.length === 1 &&
    nestedTable.rows[0].cells.length === 2 &&
    cell.childElementCount === 1
  ) {
    const cols = doc.createElement('div');
    cols.className = 'doc-letterhead-columns';
    [...nestedTable.rows[0].cells].forEach(nestedCell => {
      const col = doc.createElement('div');
      col.className = 'doc-letterhead-column';
      appendCellContent(nestedCell, col, doc);
      cols.appendChild(col);
    });
    target.appendChild(cols);
    return;
  }

  const nodes = [...cell.childNodes];
  if (nodes.length === 0 && cellTextTrim(cell)) {
    const p = doc.createElement('p');
    p.innerHTML = cell.innerHTML;
    target.appendChild(p);
    return;
  }

  for (const node of nodes) {
    if (node.nodeType === Node.TEXT_NODE) {
      const t = (node.textContent ?? '').replace(/\u00a0/g, ' ').trim();
      if (!t) continue;
      const p = doc.createElement('p');
      p.textContent = t;
      target.appendChild(p);
      continue;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) continue;
    const el = node as HTMLElement;
    const tag = el.tagName.toLowerCase();
    if (tag === 'hr') {
      target.appendChild(doc.createElement('hr'));
      continue;
    }
    if (tag === 'p') {
      if (isEmptyRuleParagraph(el)) {
        target.appendChild(doc.createElement('hr'));
        continue;
      }
      target.appendChild(el.cloneNode(true));
      continue;
    }
    if (tag === 'table') {
      appendCellContent(el, target, doc);
      continue;
    }
    if (tag === 'div') {
      if (isEmptyRuleParagraph(el)) {
        target.appendChild(doc.createElement('hr'));
        continue;
      }
      appendCellContent(el, target, doc);
      continue;
    }
    const p = doc.createElement('p');
    p.innerHTML = el.innerHTML;
    target.appendChild(p);
  }
}

function findLogoColumnIndex(table: HTMLTableElement): number | null {
  for (let r = 0; r < table.rows.length; r += 1) {
    const cells = table.rows[r].cells;
    for (let c = 0; c < cells.length; c += 1) {
      if (cells[c].querySelector('img')) return c;
    }
  }
  return null;
}

/** Word letterheads usually use a table: logo in one column, text in the other. */
export function convertLetterheadTable(table: HTMLTableElement, doc: Document): HTMLElement | null {
  const logoCol = findLogoColumnIndex(table);
  if (logoCol === null) return null;

  const img = table.querySelector('img');
  const src = img?.getAttribute('src') || '';
  if (!img || !isUsableImageSrc(src)) return null;

  const rowEl = doc.createElement('div');
  rowEl.className = 'doc-letterhead-row doc-letterhead-row--logo-left';
  rowEl.setAttribute('data-layout', 'logo-left');
  rowEl.appendChild(img.cloneNode(true));

  const aside = doc.createElement('div');
  aside.className = 'doc-letterhead-aside';

  for (let r = 0; r < table.rows.length; r += 1) {
    const row = table.rows[r];
    const textCells: HTMLElement[] = [];
    for (let c = 0; c < row.cells.length; c += 1) {
      if (c === logoCol) continue;
      const cell = row.cells[c];
      if (cell.querySelector('img')) continue;
      if (!cellTextTrim(cell) && !cell.querySelector('hr, table, img')) continue;
      textCells.push(cell);
    }

    if (textCells.length === 2) {
      const cols = doc.createElement('div');
      cols.className = 'doc-letterhead-columns';
      textCells.forEach(cell => {
        const col = doc.createElement('div');
        col.className = 'doc-letterhead-column';
        appendCellContent(cell, col, doc);
        cols.appendChild(col);
      });
      aside.appendChild(cols);
      continue;
    }

    if (textCells.length === 1) {
      appendCellContent(textCells[0], aside, doc);
    }
  }

  if (!aside.childNodes.length) return null;

  rowEl.appendChild(aside);
  return rowEl;
}

function convertOrFlattenTables(root: ParentNode, doc: Document) {
  root.querySelectorAll('table').forEach(table => {
    const converted = convertLetterheadTable(table as HTMLTableElement, doc);
    if (converted) {
      table.replaceWith(converted);
      return;
    }

    const fragment = doc.createDocumentFragment();
    table.querySelectorAll('img').forEach(imgEl => {
      fragment.appendChild(imgEl.cloneNode(true));
    });
    table.querySelectorAll('tr').forEach(tr => {
      const parts: string[] = [];
      tr.querySelectorAll('td, th').forEach(cell => {
        const text = cellTextTrim(cell as HTMLElement);
        if (text) parts.push(text);
      });
      if (parts.length) {
        const p = doc.createElement('p');
        p.textContent = parts.join(' · ');
        fragment.appendChild(p);
      }
    });
    if (!fragment.childNodes.length) {
      table.remove();
      return;
    }
    table.replaceWith(fragment);
  });
}

function unwrapImagesFromParagraphs(root: ParentNode) {
  root.querySelectorAll('p').forEach(p => {
    const imgs = p.querySelectorAll('img');
    if (!imgs.length) return;
    if (p.childNodes.length === 1 && imgs.length === 1) {
      p.replaceWith(imgs[0]);
      return;
    }
    imgs.forEach(img => {
      p.parentNode?.insertBefore(img.cloneNode(true), p);
      img.remove();
    });
    if (!cellTextTrim(p)) {
      p.remove();
    }
  });
}

function normalizeImages(root: ParentNode) {
  root.querySelectorAll('img').forEach(img => {
    const src = img.getAttribute('src') || '';
    if (!isUsableImageSrc(src)) {
      img.remove();
      return;
    }
    img.classList.add('doc-letterhead-img');
    img.removeAttribute('width');
    img.removeAttribute('height');
  });
}

function wrapInLetterheadRowIfNeeded(body: HTMLElement, doc: Document) {
  if (body.querySelector('.doc-letterhead-row')) return;
  const logo = body.querySelector('img.doc-letterhead-img, img[src]') as HTMLImageElement | null;
  if (!logo) return;

  logo.classList.add('doc-letterhead-img');
  logo.remove();

  const row = doc.createElement('div');
  row.className = 'doc-letterhead-row doc-letterhead-row--logo-left';
  row.setAttribute('data-layout', 'logo-left');
  row.appendChild(logo);

  const aside = doc.createElement('div');
  aside.className = 'doc-letterhead-aside';
  while (body.firstChild) {
    aside.appendChild(body.firstChild);
  }

  if (aside.childNodes.length) {
    row.appendChild(aside);
  }
  body.appendChild(row);
}

/** True when clipboard HTML likely needs letterhead-specific paste handling. */
export function shouldUseLetterheadPasteHandler(html: string | undefined | null): boolean {
  if (!html?.trim()) return false;
  return (
    /<img[\s>]/i.test(html) ||
    /class\s*=\s*["']?Mso/i.test(html) ||
    /xmlns:w\s*=|Word\.Document/i.test(html) ||
    /<table[\s>]/i.test(html)
  );
}

/** Rich clipboard HTML that should use Word/HTML normalization on paste. */
export function shouldCustomPasteHtml(html: string | undefined | null): boolean {
  if (!html?.trim()) return false;
  if (shouldUseLetterheadPasteHandler(html)) return true;
  return (
    /\bstyle\s*=/i.test(html) ||
    /<font[\s>]/i.test(html) ||
    /class\s*=\s*["']?Mso/i.test(html)
  );
}

/** Normalize Word / browser HTML for the page-layout mini editor (images + letterhead row). */
export function transformMiniEditorPasteHtml(html: string): string {
  if (!html?.trim()) return html;

  const normalized = normalizePastedHtml(html);
  const doc = new DOMParser().parseFromString(
    `<body>${normalized}</body>`,
    'text/html',
  );
  const body = doc.body;
  if (!body) return normalized;

  flattenHeadings(body, doc);
  convertOrFlattenTables(body, doc);
  unwrapImagesFromParagraphs(body);
  normalizeImages(body);
  stripOversizedDataUrlImages(body);
  wrapInLetterheadRowIfNeeded(body, doc);

  return body.innerHTML;
}

export async function inlineBlobImagesInHtml(html: string): Promise<string> {
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html');
  const body = doc.body;
  if (!body) return html;

  const imgs = [...body.querySelectorAll('img')];
  for (const img of imgs) {
    const src = img.getAttribute('src') || '';
    if (!src.startsWith('blob:')) continue;
    try {
      const res = await fetch(src);
      const blob = await res.blob();
      if (blob.size > MINI_EDITOR_MAX_IMAGE_BYTES) {
        img.remove();
        continue;
      }
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          if (typeof reader.result === 'string') resolve(reader.result);
          else reject(new Error('read failed'));
        };
        reader.onerror = () => reject(new Error('read failed'));
        reader.readAsDataURL(blob);
      });
      if (!dataUrl.startsWith('data:image/')) {
        img.remove();
        continue;
      }
      img.setAttribute('src', dataUrl);
      img.classList.add('doc-letterhead-img');
    } catch {
      img.remove();
    }
  }

  return body.innerHTML;
}

export const MiniEditorLetterheadPaste = Extension.create({
  name: 'miniEditorLetterheadPaste',
  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey('miniEditorLetterheadPaste'),
        props: {
          transformPastedHTML(html) {
            if (shouldUseLetterheadPasteHandler(html)) {
              return transformMiniEditorPasteHtml(html);
            }
            if (shouldCustomPasteHtml(html)) {
              return normalizePastedHtml(html);
            }
            return html;
          },
        },
      }),
    ];
  },
});
