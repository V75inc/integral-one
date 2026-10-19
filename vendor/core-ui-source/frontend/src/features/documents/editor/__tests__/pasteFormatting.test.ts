import { describe, expect, it } from 'vitest';

import { extractStyleBlocks, normalizePastedHtml } from '../pasteFormatting';

describe('extractStyleBlocks', () => {
  it('reads CSS inside Word conditional comments before they are stripped', () => {
    const html = `
      <!--[if gte mso 10]>
      <style>p.MsoNormal { font-size:14.0pt; text-align:center; }</style>
      <![endif]-->
      <p class="MsoNormal">Centered</p>
    `;
    const css = extractStyleBlocks(html);
    expect(css).toContain('MsoNormal');
    const out = normalizePastedHtml(html);
    expect(out.toLowerCase()).toContain('text-align:center');
    expect(out.toLowerCase()).toContain('font-size:14');
  });
});

describe('normalizePastedHtml', () => {
  it('inlines Word class styles onto paragraphs', () => {
    const html = `
      <html><head><style>
        p.MsoNormal { margin:0in; font-size:11.0pt; font-family:"Calibri",sans-serif; }
      </style></head><body>
        <p class="MsoNormal">Hello <b>world</b></p>
      </body></html>
    `;
    const out = normalizePastedHtml(html);
    expect(out.toLowerCase()).toContain('font-size:11');
    expect(out.toLowerCase()).toContain('font-family:');
    expect(out).toContain('Hello');
    expect(out).toContain('world');
    expect(out.toLowerCase()).toContain('<b');
  });

  it('hoists paragraph font-size onto unstyled spans for TipTap marks', () => {
    const html =
      '<p style="font-size:18pt;text-align:right"><span lang="EN">Title</span></p>';
    const out = normalizePastedHtml(html);
    expect(out.toLowerCase()).toContain('font-size:18pt');
    expect(out.toLowerCase()).toContain('text-align:right');
    expect(out).toContain('Title');
    expect(out.match(/font-size:18pt/gi)?.length).toBeGreaterThanOrEqual(1);
  });

  it('converts legacy font tags to styled spans', () => {
    const html = '<p><font face="Arial" color="#ff0000" size="4">Title</font></p>';
    const out = normalizePastedHtml(html);
    expect(out).toContain('font-family:Arial');
    expect(out).toContain('color:#ff0000');
    expect(out).toContain('Title');
    expect(out).not.toContain('<font');
  });
});
