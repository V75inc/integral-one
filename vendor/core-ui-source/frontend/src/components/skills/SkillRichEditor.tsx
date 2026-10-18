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

import { WikiEditorToolbar } from '../views/wiki/WikiEditorToolbar';
import '../views/wiki/wiki-tiptap.css';

export interface SkillRichEditorProps {
  value: string;
  onChange: (markdown: string) => void;
  placeholder?: string;
  'aria-label'?: string;
}

/**
 * WYSIWYG markdown editor for skill instructions — the friendly default
 * (simple mode). Mirrors {@link WikiRichTextEditor} but drops the wiki
 * user-mention extension (skills reference tools, not users; tool @-mentions
 * live in the raw power-mode editor). Persists markdown strings compatible
 * with {@link MarkdownContent} read rendering.
 */
export function SkillRichEditor({
  value,
  onChange,
  placeholder,
  'aria-label': ariaLabel,
}: SkillRichEditorProps) {
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const extensions = useMemo(
    () => [
      StarterKit.configure({ heading: { levels: [1, 2, 3] } }),
      Markdown,
      Link.configure({
        openOnClick: false,
        HTMLAttributes: { class: 'wiki-tiptap-link' },
      }),
      Placeholder.configure({
        placeholder: placeholder || 'Write the step-by-step procedure the agent should follow…',
      }),
      Table.configure({ resizable: false }),
      TableRow,
      TableHeader,
      TableCell,
    ],
    [placeholder],
  );

  const editor = useEditor(
    {
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
          'aria-label': ariaLabel || 'Skill instructions',
        },
      },
    },
    [extensions],
  );

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
      <div className="min-h-[20rem] px-2 py-3 md:px-3">
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}
