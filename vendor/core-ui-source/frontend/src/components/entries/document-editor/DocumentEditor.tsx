import { useEffect, useMemo, useRef } from 'react';
import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { Markdown } from '@tiptap/markdown';
import Placeholder from '@tiptap/extension-placeholder';
import Link from '@tiptap/extension-link';
import { Table } from '@tiptap/extension-table';
import { TableRow } from '@tiptap/extension-table-row';
import { TableCell } from '@tiptap/extension-table-cell';
import { TableHeader } from '@tiptap/extension-table-header';
import { DocumentToolbar } from './DocumentToolbar';
import './document-editor.css';

export interface DocumentEditorProps {
  /** The document body, as markdown. */
  value: string;
  onChange: (markdown: string) => void;
  placeholder?: string;
  'aria-label'?: string;
}

/**
 * A page-style document editor.
 *
 * Looks like the file it produces: a white page with the same heading
 * hierarchy, callouts and tables the Word / PDF output uses, and a toolbar of
 * the usual document controls (styles, lists and indent, callout, table
 * editing, link, undo and redo). The text is stored as markdown, which keeps it
 * readable and editable by the assistant and renderable to docx, pdf and pptx.
 * Per-word fonts, sizes and colours are not part of that format.
 */
export function DocumentEditor({
  value,
  onChange,
  placeholder,
  'aria-label': ariaLabel,
}: DocumentEditorProps) {
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const extensions = useMemo(
    () => [
      StarterKit.configure({ heading: { levels: [1, 2, 3] } }),
      Markdown,
      Link.configure({ openOnClick: false, HTMLAttributes: { class: 'doc-link' } }),
      Placeholder.configure({
        placeholder: placeholder || 'Start writing your document…',
      }),
      Table.configure({ resizable: false }),
      TableRow,
      TableHeader,
      TableCell,
    ],
    // The placeholder is read once; changing the extension list would reset the
    // editor and drop the cursor and undo history.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  const editor = useEditor(
    {
      extensions,
      content: value || '',
      contentType: 'markdown',
      immediatelyRender: false,
      onUpdate: ({ editor: ed }) => onChangeRef.current(ed.getMarkdown()),
      editorProps: {
        attributes: {
          class: 'doc-page-content',
          'aria-label': ariaLabel || 'Document content',
        },
      },
    },
    [extensions]
  );

  // Take in outside changes (an approved assistant edit) without disturbing the
  // cursor when the text is already the same.
  useEffect(() => {
    if (!editor) return;
    const next = value || '';
    if (next !== editor.getMarkdown()) {
      editor.commands.setContent(next, { contentType: 'markdown', emitUpdate: false });
    }
  }, [editor, value]);

  const words = editor ? (editor.getText().trim().match(/\S+/g) || []).length : 0;

  return (
    <div className="doc-editor-root">
      <DocumentToolbar editor={editor} />
      <div className="doc-editor-desk">
        <div className="doc-page" onClick={() => editor?.chain().focus().run()}>
          <EditorContent editor={editor} />
        </div>
      </div>
      <div className="doc-editor-status" aria-live="polite">
        {words} {words === 1 ? 'word' : 'words'}
      </div>
    </div>
  );
}
