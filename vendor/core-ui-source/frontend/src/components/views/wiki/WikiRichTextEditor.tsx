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
import { WikiEditorToolbar } from './WikiEditorToolbar';
import { createWikiAtMentionExtension } from './wikiAtMentionExtension';
import './wiki-tiptap.css';

export interface WikiRichTextEditorProps {
  value: string;
  onChange: (markdown: string) => void;
  placeholder?: string;
  /** Scopes @-mention candidates to users with access on this track. */
  trackId?: string;
  'aria-label'?: string;
}

/**
 * WYSIWYG markdown editor for wiki page bodies. Persists markdown strings
 * compatible with {@link MarkdownContent} read rendering.
 */
export function WikiRichTextEditor({
  value,
  onChange,
  placeholder,
  trackId,
  'aria-label': ariaLabel,
}: WikiRichTextEditorProps) {
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const extensions = useMemo(
    () => [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
      }),
      Markdown,
      Link.configure({
        openOnClick: false,
        HTMLAttributes: { class: 'wiki-tiptap-link' },
      }),
      Placeholder.configure({
        placeholder: placeholder || 'Write your documentation…',
      }),
      Table.configure({ resizable: false }),
      TableRow,
      TableHeader,
      TableCell,
      createWikiAtMentionExtension(trackId),
    ],
    // `placeholder` is read inside but deliberately omitted: changing the
    // extension array re-initialises the TipTap editor, dropping cursor and
    // undo history. Callers remount via `key` when the entry type changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [trackId]
  );

  const editor = useEditor({
    extensions,
    content: value || '',
    contentType: 'markdown',
    immediatelyRender: false,
    onUpdate: ({ editor: ed }) => {
      onChangeRef.current(ed.getMarkdown());
    },
    editorProps: {
      attributes: {
        class: 'wiki-tiptap-prose',
        'aria-label': ariaLabel || 'Page content',
      },
    },
  }, [extensions]);

  useEffect(() => {
    if (!editor) return;
    const current = editor.getMarkdown();
    const next = value || '';
    if (next !== current) {
      editor.commands.setContent(next, {
        contentType: 'markdown',
        emitUpdate: false,
      });
    }
  }, [editor, value]);

  return (
    <div className="wiki-tiptap-root rounded-lg border border-[var(--panel-border)] bg-[var(--bg)] overflow-hidden">
      <WikiEditorToolbar editor={editor} />
      <div className="px-2 py-3 md:px-3">
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}
