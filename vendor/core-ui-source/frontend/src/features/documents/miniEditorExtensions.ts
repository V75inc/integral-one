import { Node, mergeAttributes } from '@tiptap/core';
import TextAlign from '@tiptap/extension-text-align';
import { TextStyle } from '@tiptap/extension-text-style';
import Color from '@tiptap/extension-color';

import { BlockTextAlignFromStyle } from './editor/pasteFormatting';
import { FontFamily, FontSize } from './editor/typographyExtensions';
import { MiniEditorLetterheadPaste } from './miniEditorPaste';

/** Max encoded logo size for inline data URLs in letterhead HTML. */
export const MINI_EDITOR_MAX_IMAGE_BYTES = 350_000;

export const LETTERHEAD_LAYOUTS = [
  { key: 'logo-left', label: 'Logo left' },
  { key: 'logo-right', label: 'Logo right' },
  { key: 'stacked', label: 'Logo above text' },
] as const;

export type LetterheadLayoutKey = (typeof LETTERHEAD_LAYOUTS)[number]['key'];

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    miniImage: {
      insertMiniImage: (attrs: { src: string; alt?: string }) => ReturnType;
    };
    letterheadRow: {
      insertLetterheadRow: (layout?: LetterheadLayoutKey) => ReturnType;
      setLetterheadLayout: (layout: LetterheadLayoutKey) => ReturnType;
    };
  }
}

export const MiniImage = Node.create({
  name: 'miniImage',
  group: 'block',
  atom: true,
  draggable: true,

  addAttributes() {
    return {
      src: { default: null },
      alt: { default: '' },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'img[src]',
        getAttrs: el => {
          const img = el as HTMLImageElement;
          return {
            src: img.getAttribute('src'),
            alt: img.getAttribute('alt') || '',
          };
        },
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'img',
      mergeAttributes(HTMLAttributes, {
        class: 'doc-letterhead-img',
        alt: HTMLAttributes.alt || '',
      }),
    ];
  },

  addCommands() {
    return {
      insertMiniImage:
        (attrs: { src: string; alt?: string }) =>
        ({ commands }) =>
          commands.insertContent({
            type: this.name,
            attrs,
          }),
    };
  },
});

/** Text block beside the logo (multi-line letterheads, rules, two-column footer). */
export const LetterheadAside = Node.create({
  name: 'letterheadAside',
  content: '(paragraph | horizontalRule | letterheadColumns)+',
  defining: true,

  parseHTML() {
    return [{ tag: 'div.doc-letterhead-aside' }];
  },

  renderHTML() {
    return ['div', { class: 'doc-letterhead-aside' }, 0];
  },
});

export const LetterheadColumn = Node.create({
  name: 'letterheadColumn',
  content: 'paragraph+',

  parseHTML() {
    return [{ tag: 'div.doc-letterhead-column' }];
  },

  renderHTML() {
    return ['div', { class: 'doc-letterhead-column' }, 0];
  },
});

export const LetterheadColumns = Node.create({
  name: 'letterheadColumns',
  content: 'letterheadColumn{2}',

  parseHTML() {
    return [{ tag: 'div.doc-letterhead-columns' }];
  },

  renderHTML() {
    return ['div', { class: 'doc-letterhead-columns' }, 0];
  },
});

export const LetterheadRow = Node.create({
  name: 'letterheadRow',
  group: 'block',
  content: 'miniImage? (letterheadAside | paragraph+)',
  defining: true,

  addAttributes() {
    return {
      layout: { default: 'logo-left' },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'div.doc-letterhead-row',
        getAttrs: el => ({
          layout:
            (el as HTMLElement).getAttribute('data-layout') ||
            [...(el as HTMLElement).classList]
              .find(c => c.startsWith('doc-letterhead-row--'))
              ?.replace('doc-letterhead-row--', '') ||
            'logo-left',
        }),
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    const layout = (HTMLAttributes.layout || 'logo-left') as string;
    return [
      'div',
      mergeAttributes(HTMLAttributes, {
        class: `doc-letterhead-row doc-letterhead-row--${layout}`,
        'data-layout': layout,
      }),
      0,
    ];
  },

  addCommands() {
    return {
      insertLetterheadRow:
        (layout: LetterheadLayoutKey = 'logo-left') =>
        ({ commands }) =>
          commands.insertContent({
            type: this.name,
            attrs: { layout },
            content: [
              {
                type: 'letterheadAside',
                content: [{ type: 'paragraph' }],
              },
            ],
          }),
      setLetterheadLayout:
        (layout: LetterheadLayoutKey) =>
        ({ commands }) =>
          commands.updateAttributes(this.name, { layout }),
    };
  },
});

export function createMiniEditorExtensions() {
  return [
    MiniImage,
    LetterheadColumn,
    LetterheadColumns,
    LetterheadAside,
    LetterheadRow,
    TextStyle,
    Color.configure({ types: ['textStyle'] }),
    FontFamily,
    FontSize,
    BlockTextAlignFromStyle,
    TextAlign.configure({
      types: ['paragraph', 'letterheadRow', 'letterheadAside'],
    }),
    MiniEditorLetterheadPaste,
  ];
}

export async function readImageAsDataUrl(
  file: File,
  maxBytes = MINI_EDITOR_MAX_IMAGE_BYTES,
): Promise<string> {
  if (!file.type.startsWith('image/')) {
    throw new Error('Please choose an image file (PNG, JPG, or GIF).');
  }
  if (file.size > maxBytes) {
    throw new Error(
      `Image is too large (${Math.round(file.size / 1024)} KB). Use a file under ${Math.round(maxBytes / 1024)} KB.`,
    );
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : '';
      if (!result.startsWith('data:image/')) {
        reject(new Error('Could not read that image.'));
        return;
      }
      resolve(result);
    };
    reader.onerror = () => reject(new Error('Could not read that image.'));
    reader.readAsDataURL(file);
  });
}
