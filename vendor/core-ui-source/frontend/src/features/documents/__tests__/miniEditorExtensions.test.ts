import { describe, expect, it } from 'vitest';
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { createMiniEditorExtensions } from '../miniEditorExtensions';

function createEditor(content = '<p></p>') {
  return new Editor({
    extensions: [
      StarterKit.configure({ heading: false, blockquote: false, codeBlock: false }),
      ...createMiniEditorExtensions(),
    ],
    content,
  });
}

describe('miniEditorExtensions', () => {
  it('inserts letterhead row with image into empty document', () => {
    const editor = createEditor();
    const ok = editor
      .chain()
      .focus()
      .insertContent({
        type: 'letterheadRow',
        attrs: { layout: 'logo-left' },
        content: [
          { type: 'miniImage', attrs: { src: 'data:image/png;base64,abc', alt: 'Logo' } },
          {
            type: 'letterheadAside',
            content: [{ type: 'paragraph' }],
          },
        ],
      })
      .run();

    expect(ok).toBe(true);
    expect(editor.getHTML()).toContain('doc-letterhead-img');
    expect(editor.getHTML()).toContain('data:image/png;base64,abc');
    editor.destroy();
  });
});
