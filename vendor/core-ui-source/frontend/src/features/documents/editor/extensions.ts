import { Extension, Node, mergeAttributes } from '@tiptap/core';
import { fieldTokenDisplayText, formatFieldRefDisplay } from '../fieldRef';

export interface FieldTokenAttrs {
  fieldKey: string;
  label: string;
  /** Editor display, e.g. ``{{hr_app.recruitment.address_line}}`` */
  placeholder?: string;
  format: string;
  fallback: string;
  missingPolicy: string;
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    fieldToken: {
      insertFieldToken: (attrs: Partial<FieldTokenAttrs>) => ReturnType;
      updateFieldToken: (attrs: Partial<FieldTokenAttrs>) => ReturnType;
    };
    pageBreak: {
      insertPageBreak: () => ReturnType;
    };
    lineHeight: {
      setLineHeight: (lineHeight: string) => ReturnType;
      unsetLineHeight: () => ReturnType;
    };
    indent: {
      indent: () => ReturnType;
      outdent: () => ReturnType;
    };
    signaturePlaceholder: {
      insertSignaturePlaceholder: (attrs: Record<string, unknown>) => ReturnType;
      updateSignaturePlaceholder: (attrs: Record<string, unknown>) => ReturnType;
    };
  }
}

const BLOCK_STYLE_TYPES = ['paragraph', 'heading', 'blockquote'] as const;
const INDENT_STEP = 24;
const INDENT_MAX = 8;

export const LINE_HEIGHT_OPTIONS = [
  { value: '', label: 'Line spacing' },
  { value: '1', label: 'Single' },
  { value: '1.15', label: '1.15' },
  { value: '1.5', label: '1.5' },
  { value: '1.75', label: '1.75' },
  { value: '2', label: 'Double' },
  { value: '2.5', label: '2.5' },
] as const;

function parseIndent(element: HTMLElement): number {
  const raw = element.getAttribute('data-indent');
  if (raw) {
    const n = parseInt(raw, 10);
    if (Number.isFinite(n)) return Math.max(0, Math.min(INDENT_MAX, n));
  }
  const pad = element.style.paddingLeft;
  const px = pad.endsWith('px') ? parseInt(pad, 10) : NaN;
  if (Number.isFinite(px) && px > 0) {
    return Math.max(0, Math.min(INDENT_MAX, Math.round(px / INDENT_STEP)));
  }
  return 0;
}

export const BlockLayout = Extension.create({
  name: 'blockLayout',
  addGlobalAttributes() {
    return [
      {
        types: [...BLOCK_STYLE_TYPES],
        attributes: {
          lineHeight: {
            default: null,
            parseHTML: element =>
              (element as HTMLElement).style.lineHeight || null,
            renderHTML: attributes =>
              attributes.lineHeight
                ? { style: `line-height: ${attributes.lineHeight}` }
                : {},
          },
          indent: {
            default: 0,
            parseHTML: element => parseIndent(element as HTMLElement),
            renderHTML: attributes => {
              const n = Number(attributes.indent) || 0;
              if (n <= 0) return {};
              return {
                'data-indent': String(n),
                style: `padding-left: ${n * INDENT_STEP}px`,
              };
            },
          },
        },
      },
    ];
  },
  addCommands() {
    return {
      setLineHeight:
        lineHeight =>
        ({ editor, commands }) => {
          const type = BLOCK_STYLE_TYPES.find(t => editor.isActive(t));
          if (!type) return false;
          return commands.updateAttributes(type, {
            lineHeight: lineHeight || null,
          });
        },
      unsetLineHeight:
        () =>
        ({ editor, commands }) => {
          const type = BLOCK_STYLE_TYPES.find(t => editor.isActive(t));
          if (!type) return false;
          return commands.resetAttributes(type, 'lineHeight');
        },
      indent:
        () =>
        ({ editor, commands }) => {
          if (editor.isActive('listItem')) {
            return commands.sinkListItem('listItem');
          }
          const type = BLOCK_STYLE_TYPES.find(t => editor.isActive(t));
          if (!type) return false;
          const current = Number(editor.getAttributes(type).indent) || 0;
          return commands.updateAttributes(type, {
            indent: Math.min(INDENT_MAX, current + 1),
          });
        },
      outdent:
        () =>
        ({ editor, commands }) => {
          if (editor.isActive('listItem')) {
            return commands.liftListItem('listItem');
          }
          const type = BLOCK_STYLE_TYPES.find(t => editor.isActive(t));
          if (!type) return false;
          const current = Number(editor.getAttributes(type).indent) || 0;
          return commands.updateAttributes(type, {
            indent: Math.max(0, current - 1),
          });
        },
    };
  },
  addKeyboardShortcuts() {
    return {
      Tab: () => this.editor.commands.indent(),
      'Shift-Tab': () => this.editor.commands.outdent(),
    };
  },
});

export const FieldToken = Node.create({
  name: 'fieldToken',
  group: 'inline',
  inline: true,
  atom: true,
  marks: '_',
  selectable: true,
  draggable: true,

  addAttributes() {
    return {
      fieldKey: { default: '' },
      label: { default: '' },
      placeholder: { default: '' },
      format: { default: 'default' },
      fallback: { default: '' },
      missingPolicy: { default: 'blank' },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'span[data-field-token]',
        getAttrs: el => {
          const element = el as HTMLElement;
          return {
            fieldKey: element.getAttribute('data-field-key') || '',
            label: element.getAttribute('data-label') || '',
            placeholder: element.getAttribute('data-placeholder') || '',
            format: element.getAttribute('data-format') || 'default',
            fallback: element.getAttribute('data-fallback') || '',
            missingPolicy: element.getAttribute('data-missing-policy') || 'blank',
          };
        },
      },
    ];
  },

  renderHTML({ node, HTMLAttributes }) {
    const display = fieldTokenDisplayText(node.attrs as FieldTokenAttrs);
    const label = node.attrs.label || node.attrs.fieldKey || 'Field';
    return [
      'span',
      mergeAttributes(HTMLAttributes, {
        'data-field-token': 'true',
        'data-field-key': node.attrs.fieldKey,
        'data-label': node.attrs.label,
        'data-placeholder': node.attrs.placeholder || '',
        'data-format': node.attrs.format,
        'data-fallback': node.attrs.fallback,
        'data-missing-policy': node.attrs.missingPolicy,
        title: label,
        class: 'doc-field-token',
        contenteditable: 'false',
      }),
      display,
    ];
  },

  addCommands() {
    return {
      insertFieldToken:
        attrs =>
        ({ commands }) => {
          const fieldKey = String(attrs.fieldKey || '').trim();
          const placeholder =
            String(attrs.placeholder || '').trim() ||
            (fieldKey ? formatFieldRefDisplay(fieldKey) : '');
          return commands.insertContent({
            type: this.name,
            attrs: {
              fieldKey,
              label: attrs.label || fieldKey || 'Field',
              placeholder,
              format: attrs.format || 'default',
              fallback: attrs.fallback || '',
              missingPolicy: attrs.missingPolicy || 'blank',
            },
          });
        },
      updateFieldToken:
        attrs =>
        ({ tr, state, dispatch }) => {
          let pos = -1;
          const key = String(attrs.fieldKey || '');
          const selected = state.doc.nodeAt(state.selection.from);
          if (selected?.type.name === this.name) {
            pos = state.selection.from;
          } else if (key) {
            state.doc.descendants((node, nodePos) => {
              if (node.type.name === this.name && node.attrs.fieldKey === key) {
                pos = nodePos;
                return false;
              }
              return true;
            });
          }
          if (pos < 0) return false;
          const node = state.doc.nodeAt(pos);
          if (!node || node.type.name !== this.name) return false;
          if (dispatch) {
            tr.setNodeMarkup(pos, undefined, {
              ...node.attrs,
              ...attrs,
            });
            dispatch(tr);
          }
          return true;
        },
    };
  },
});

export const PageBreak = Node.create({
  name: 'pageBreak',
  group: 'block',
  atom: true,
  selectable: true,

  parseHTML() {
    return [{ tag: 'div[data-page-break]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'div',
      mergeAttributes(HTMLAttributes, {
        'data-page-break': 'true',
        class: 'doc-page-break',
      }),
      ['hr'],
      ['span', { class: 'doc-page-break-label' }, 'Page break'],
    ];
  },

  addCommands() {
    return {
      insertPageBreak:
        () =>
        ({ commands }) =>
          commands.insertContent({ type: this.name }),
    };
  },
});

export const SignaturePlaceholder = Node.create({
  name: 'signaturePlaceholder',
  group: 'block',
  atom: true,
  selectable: true,

  addAttributes() {
    return {
      role: { default: 'signature' },
      label: { default: 'Signature' },
      mode: { default: 'runtime' },
      width: { default: 220 },
      height: { default: 48 },
      embeddedPngB64: { default: '' },
      embeddedAttachmentId: { default: '' },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'div[data-signature-placeholder]',
        getAttrs: el => {
          const element = el as HTMLElement;
          return {
            role: element.getAttribute('data-role') || 'signature',
            label: element.getAttribute('data-label') || 'Signature',
            mode: element.getAttribute('data-mode') || 'runtime',
          };
        },
      },
    ];
  },

  renderHTML({ node, HTMLAttributes }) {
    const mode = String(node.attrs.mode || 'runtime');
    const isPre = mode === 'pre_embedded';
    const preview = String(node.attrs.embeddedPngB64 || '').trim();
    const children: unknown[] = isPre && preview
      ? [
          [
            'img',
            {
              class: 'doc-signature-image',
              src: preview.startsWith('data:')
                ? preview
                : `data:image/png;base64,${preview}`,
              alt: node.attrs.label || 'Signature',
            },
          ],
          ['div', { class: 'doc-signature-label' }, node.attrs.label || 'Signature'],
        ]
      : [
          ['div', { class: 'doc-signature-line' }, '______________________________'],
          ['div', { class: 'doc-signature-label' }, node.attrs.label || 'Signature'],
        ];
    return [
      'div',
      mergeAttributes(HTMLAttributes, {
        'data-signature-placeholder': 'true',
        'data-role': node.attrs.role,
        'data-label': node.attrs.label,
        'data-mode': mode,
        class: `doc-signature${isPre ? ' doc-signature--embedded' : ' doc-signature--runtime'}`,
      }),
      ...children,
    ];
  },

  addCommands() {
    return {
      insertSignaturePlaceholder:
        attrs =>
        ({ commands }) =>
          commands.insertContent({
            type: this.name,
            attrs: {
              role: attrs.role || 'signature',
              label: attrs.label || 'Signature',
              mode: attrs.mode || 'runtime',
              width: attrs.width || 220,
              height: attrs.height || 48,
              embeddedPngB64: attrs.embeddedPngB64 || '',
              embeddedAttachmentId: attrs.embeddedAttachmentId || '',
            },
          }),
      updateSignaturePlaceholder:
        attrs =>
        ({ commands }) =>
          commands.updateAttributes(this.name, attrs),
    };
  },
});

/** Phase 8 scaffold — rendered as a wrapper; expansion is server-side. */
export const RepeatSection = Node.create({
  name: 'repeatSection',
  group: 'block',
  content: 'block+',
  defining: true,

  addAttributes() {
    return {
      collectionKey: { default: '' },
      label: { default: 'Repeat' },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-repeat-section]' }];
  },

  renderHTML({ node, HTMLAttributes }) {
    return [
      'div',
      mergeAttributes(HTMLAttributes, {
        'data-repeat-section': 'true',
        'data-collection-key': node.attrs.collectionKey,
        class: 'doc-repeat',
      }),
      0,
    ];
  },
});

export const ConditionalSection = Node.create({
  name: 'conditionalSection',
  group: 'block',
  content: 'block+',
  defining: true,

  addAttributes() {
    return {
      fieldKey: { default: '' },
      operator: { default: 'eq' },
      value: { default: '' },
      label: { default: 'If…' },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-conditional-section]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'div',
      mergeAttributes(HTMLAttributes, {
        'data-conditional-section': 'true',
        class: 'doc-conditional',
      }),
      0,
    ];
  },
});
