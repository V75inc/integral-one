import { describe, expect, it } from 'vitest';
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';

import { createMiniEditorExtensions } from '../miniEditorExtensions';
import {
  convertLetterheadTable,
  shouldUseLetterheadPasteHandler,
  transformMiniEditorPasteHtml,
} from '../miniEditorPaste';

function createEditor(content = '<p></p>') {
  return new Editor({
    extensions: [
      StarterKit.configure({ heading: false, blockquote: false, codeBlock: false }),
      ...createMiniEditorExtensions(),
    ],
    content,
  });
}

describe('shouldUseLetterheadPasteHandler', () => {
  it('detects HTML with images', () => {
    expect(shouldUseLetterheadPasteHandler('<p><img src="data:image/png;base64,x"/></p>')).toBe(
      true,
    );
    expect(shouldUseLetterheadPasteHandler('<p>Hello</p>')).toBe(false);
  });
});

describe('transformMiniEditorPasteHtml', () => {
  it('wraps pasted logo + text in a row with text beside the logo', () => {
    const html =
      '<p style="text-align:center">Acme Corp</p><p><img src="data:image/png;base64,abc" alt="Logo"/></p>';
    const out = transformMiniEditorPasteHtml(html);
    expect(out).toContain('doc-letterhead-row');
    expect(out).toContain('doc-letterhead-aside');
    expect(out).toContain('doc-letterhead-img');
    expect(out).toContain('Acme Corp');
  });

  it('converts a Word-style logo table into logo + aside layout', () => {
    const doc = new DOMParser().parseFromString('<body></body>', 'text/html');
    const table = doc.createElement('table');
    table.innerHTML = `<tr>
      <td><img src="data:image/png;base64,abc" alt="Seal"/></td>
      <td><p><strong>V75 Incorporated</strong></p><p><em>Technology with Impact</em></p></td>
    </tr>
    <tr>
      <td></td>
      <td><p style="border-bottom:1pt solid #000">&nbsp;</p></td>
    </tr>
    <tr>
      <td></td>
      <td><table><tr>
        <td><p>1 Wren Avenue</p><p>Georgetown, Guyana.</p></td>
        <td><p>Tel: (592)-621-4954</p><p><a href="https://v75inc.com">https://v75inc.com</a></p></td>
      </tr></table></td>
    </tr>`;
    const converted = convertLetterheadTable(table, doc);
    expect(converted).not.toBeNull();
    const html = converted!.outerHTML;
    expect(html).toContain('doc-letterhead-row');
    expect(html).toContain('doc-letterhead-aside');
    expect(html).toContain('V75 Incorporated');
    expect(html).toContain('doc-letterhead-columns');
    expect(html).toContain('Georgetown');
    expect(html).toContain('v75inc.com');

    const editor = createEditor('<p></p>');
    const ok = editor.chain().focus().insertContent(html).run();
    expect(ok).toBe(true);
    expect(editor.getHTML()).toContain('doc-letterhead-aside');
    editor.destroy();
  });

  it('strips unusable file:// images', () => {
    const html = '<p><img src="file:///tmp/logo.png"/></p><p>Title</p>';
    const out = transformMiniEditorPasteHtml(html);
    expect(out).not.toContain('file://');
    expect(out).toContain('Title');
  });

  it('preserves font size after paste through the editor', () => {
    const html =
      '<html><head><style>p.MsoNormal { font-size:18.0pt; font-family:"Calibri",sans-serif; }</style></head><body><p class="MsoNormal">Big title</p></body></html>';
    const transformed = transformMiniEditorPasteHtml(html);
    const editor = createEditor('<p></p>');
    editor.chain().focus().insertContent(transformed).run();
    const out = editor.getHTML().toLowerCase();
    expect(out).toContain('big title');
    expect(out).toMatch(/font-size:\s*18/);
    editor.destroy();
  });

  it('parses into the mini editor schema after transform', () => {
    const html =
      '<p>Line one</p><img src="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7" />';
    const transformed = transformMiniEditorPasteHtml(html);
    const editor = createEditor('<p></p>');
    const ok = editor.chain().focus().insertContent(transformed).run();
    expect(ok).toBe(true);
    expect(editor.getHTML()).toContain('doc-letterhead-img');
    expect(editor.getHTML()).toContain('Line one');
    editor.destroy();
  });
});
