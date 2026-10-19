import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { EditorContent, useEditor, type Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import Link from '@tiptap/extension-link';
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bold,
  ImagePlus,
  Italic,
  LayoutTemplate,
  Link2,
  Underline as UnderlineIcon,
} from 'lucide-react';
import { Text } from '../../ui';
import { useToast } from '../../context/ToastContext';
import {
  createMiniEditorExtensions,
  LETTERHEAD_LAYOUTS,
  readImageAsDataUrl,
  type LetterheadLayoutKey,
} from './miniEditorExtensions';
import { normalizePastedHtml } from './editor/pasteFormatting';
import {
  inlineBlobImagesInHtml,
  shouldCustomPasteHtml,
  shouldUseLetterheadPasteHandler,
  transformMiniEditorPasteHtml,
} from './miniEditorPaste';

interface Props {
  label: string;
  html: string;
  onChange: (html: string) => void;
  placeholder?: string;
}

/** Lightweight header/footer editor — serializes to HTML for merge + PDF pipeline. */
export function MiniRichTextEditor({ label, html, onChange, placeholder }: Props) {
  const { showToast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const editorRef = useRef<Editor | null>(null);
  const showToastRef = useRef(showToast);
  showToastRef.current = showToast;
  const [layoutOpen, setLayoutOpen] = useState(false);

  const extensions = useMemo(
    () => [
      StarterKit.configure({ heading: false, blockquote: false, codeBlock: false }),
      Underline,
      Link.configure({ openOnClick: false }),
      ...createMiniEditorExtensions(),
    ],
    [],
  );

  const editor = useEditor({
    extensions,
    content: html || '<p></p>',
    immediatelyRender: false,
    onUpdate: ({ editor: ed }) => {
      onChange(ed.getHTML());
    },
    editorProps: {
      attributes: {
        class: 'doc-mini-prose',
        'aria-label': label,
        'data-placeholder': placeholder || '',
      },
      handlePaste: (_view, event) => {
        const cd = event.clipboardData;
        if (!cd) return false;

        const html = cd.getData('text/html');
        const imageFiles = [...cd.files].filter(f => f.type.startsWith('image/'));

        if (imageFiles.length && !html?.trim()) {
          event.preventDefault();
          void insertImageFromFileRef.current(imageFiles[0]);
          return true;
        }

        if (!shouldCustomPasteHtml(html)) return false;

        event.preventDefault();
        void (async () => {
          const ed = editorRef.current;
          if (!ed) return;
          let transformed = shouldUseLetterheadPasteHandler(html)
            ? transformMiniEditorPasteHtml(html)
            : normalizePastedHtml(html);
          const beforeImgs = (transformed.match(/<img[\s>]/gi) || []).length;
          transformed = await inlineBlobImagesInHtml(transformed);
          const afterImgs = (transformed.match(/<img[\s>]/gi) || []).length;
          if (beforeImgs > 0 && afterImgs === 0) {
            showToastRef.current(
              'Some images could not be pasted. Try copying again from Word or use Add image.',
              'info',
            );
          }
          const inserted = ed.chain().focus().insertContent(transformed).run();
          if (!inserted) {
            showToastRef.current(
              'Could not paste that content. Try a smaller letterhead or add images manually.',
              'error',
            );
          }
        })();
        return true;
      },
    },
  });

  const insertImageFromFileRef = useRef<(file: File) => Promise<void>>(async () => {});

  const insertImageFromFile = useCallback(async (file: File) => {
    const ed = editorRef.current;
    if (!ed) return;
    try {
      const src = await readImageAsDataUrl(file);
      const alt = file.name.replace(/\.[^.]+$/, '') || 'Logo';

      if (ed.isActive('letterheadRow')) {
        const inserted = ed
          .chain()
          .focus()
          .insertContent({ type: 'miniImage', attrs: { src, alt } })
          .run();
        if (!inserted) {
          showToastRef.current('Could not add image to the layout row. Try again.', 'error');
        }
        return;
      }

      const inserted = ed
        .chain()
        .focus()
        .insertContent({
          type: 'letterheadRow',
          attrs: { layout: 'logo-left' },
          content: [
            { type: 'miniImage', attrs: { src, alt } },
            {
              type: 'letterheadAside',
              content: [{ type: 'paragraph' }],
            },
          ],
        })
        .run();
      if (!inserted) {
        showToastRef.current('Could not add image to the editor. Try again.', 'error');
      }
    } catch (err) {
      showToastRef.current(err instanceof Error ? err.message : 'Could not add image', 'error');
    }
  }, []);

  useEffect(() => {
    insertImageFromFileRef.current = insertImageFromFile;
  }, [insertImageFromFile]);

  useEffect(() => {
    editorRef.current = editor ?? null;
  }, [editor]);

  useEffect(() => {
    if (!editor) return;
    const current = editor.getHTML();
    const next = html || '<p></p>';
    if (current !== next && !editor.isFocused) {
      editor.commands.setContent(next, { emitUpdate: false });
    }
  }, [editor, html]);

  const setLink = () => {
    if (!editor) return;
    const prev = editor.getAttributes('link').href as string | undefined;
    const url = window.prompt('Link address', prev || 'https://');
    if (url === null) return;
    if (url.trim() === '') {
      editor.chain().focus().extendMarkRange('link').unsetLink().run();
      return;
    }
    editor.chain().focus().extendMarkRange('link').setLink({ href: url.trim() }).run();
  };

  const applyLayout = (layout: LetterheadLayoutKey) => {
    if (!editor) return;
    setLayoutOpen(false);
    if (editor.isActive('letterheadRow')) {
      editor.chain().focus().setLetterheadLayout(layout).run();
      return;
    }
    editor.chain().focus().insertLetterheadRow(layout).run();
  };

  const activeLayout = editor?.getAttributes('letterheadRow').layout as
    | LetterheadLayoutKey
    | undefined;

  return (
    <div className="doc-mini-editor">
      <Text variant="label" tone="muted" as="span" className="doc-mini-editor-label block">
        {label}
      </Text>
      {editor ? (
        <div className="doc-mini-toolbar-wrap">
          <div className="doc-mini-toolbar" role="toolbar" aria-label={`${label} formatting`}>
            <button
              type="button"
              className={`doc-mini-toolbar-btn${editor.isActive('bold') ? ' doc-mini-toolbar-btn--active' : ''}`}
              aria-label="Bold"
              onClick={() => editor.chain().focus().toggleBold().run()}
            >
              <Bold size={14} strokeWidth={2} />
            </button>
            <button
              type="button"
              className={`doc-mini-toolbar-btn${editor.isActive('italic') ? ' doc-mini-toolbar-btn--active' : ''}`}
              aria-label="Italic"
              onClick={() => editor.chain().focus().toggleItalic().run()}
            >
              <Italic size={14} strokeWidth={2} />
            </button>
            <button
              type="button"
              className={`doc-mini-toolbar-btn${editor.isActive('underline') ? ' doc-mini-toolbar-btn--active' : ''}`}
              aria-label="Underline"
              onClick={() => editor.chain().focus().toggleUnderline().run()}
            >
              <UnderlineIcon size={14} strokeWidth={2} />
            </button>
            <button
              type="button"
              className={`doc-mini-toolbar-btn${editor.isActive('link') ? ' doc-mini-toolbar-btn--active' : ''}`}
              aria-label="Link"
              onClick={setLink}
            >
              <Link2 size={14} strokeWidth={2} />
            </button>
            <span className="doc-mini-toolbar-divider" aria-hidden />
            <button
              type="button"
              className={`doc-mini-toolbar-btn${editor.isActive({ textAlign: 'left' }) ? ' doc-mini-toolbar-btn--active' : ''}`}
              aria-label="Align left"
              onClick={() => editor.chain().focus().setTextAlign('left').run()}
            >
              <AlignLeft size={14} strokeWidth={2} />
            </button>
            <button
              type="button"
              className={`doc-mini-toolbar-btn${editor.isActive({ textAlign: 'center' }) ? ' doc-mini-toolbar-btn--active' : ''}`}
              aria-label="Align center"
              onClick={() => editor.chain().focus().setTextAlign('center').run()}
            >
              <AlignCenter size={14} strokeWidth={2} />
            </button>
            <button
              type="button"
              className={`doc-mini-toolbar-btn${editor.isActive({ textAlign: 'right' }) ? ' doc-mini-toolbar-btn--active' : ''}`}
              aria-label="Align right"
              onClick={() => editor.chain().focus().setTextAlign('right').run()}
            >
              <AlignRight size={14} strokeWidth={2} />
            </button>
            <span className="doc-mini-toolbar-divider" aria-hidden />
            <button
              type="button"
              className="doc-mini-toolbar-btn"
              aria-label="Add image"
              onClick={() => fileRef.current?.click()}
            >
              <ImagePlus size={14} strokeWidth={2} />
            </button>
            <div className="doc-mini-toolbar-layout">
              <button
                type="button"
                className={`doc-mini-toolbar-btn doc-mini-toolbar-btn--wide${
                  editor.isActive('letterheadRow') ? ' doc-mini-toolbar-btn--active' : ''
                }`}
                aria-expanded={layoutOpen}
                aria-haspopup="menu"
                onClick={() => setLayoutOpen(o => !o)}
              >
                <LayoutTemplate size={14} strokeWidth={2} />
                <span className="doc-mini-toolbar-btn-label">Layout</span>
              </button>
              {layoutOpen ? (
                <div className="doc-mini-layout-menu" role="menu">
                  {LETTERHEAD_LAYOUTS.map(opt => (
                    <button
                      key={opt.key}
                      type="button"
                      role="menuitem"
                      className={`doc-mini-layout-option${
                        activeLayout === opt.key ? ' doc-mini-layout-option--active' : ''
                      }`}
                      onClick={() => applyLayout(opt.key)}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          </div>
          <Text variant="body-sm" tone="muted" className="doc-mini-toolbar-hint">
            Paste your letterhead from Word or the web (Ctrl+V / ⌘V), or add a logo with
            the image button, then pick a layout.
          </Text>
        </div>
      ) : null}
      <input
        ref={fileRef}
        type="file"
        accept="image/png,image/jpeg,image/gif,image/webp"
        className="sr-only"
        onChange={e => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (file) void insertImageFromFile(file);
        }}
      />
      <div className="doc-mini-editor-content">
        <EditorContent editor={editor} />
        {!editor ? (
          <Text variant="body-sm" tone="muted">
            {placeholder || 'Loading…'}
          </Text>
        ) : null}
      </div>
    </div>
  );
}
