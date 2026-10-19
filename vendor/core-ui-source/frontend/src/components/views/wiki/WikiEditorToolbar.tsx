import type { ReactNode } from 'react';
import type { Editor } from '@tiptap/core';
import {
  Bold,
  Italic,
  Strikethrough,
  List,
  ListOrdered,
  Quote,
  Code,
  Heading1,
  Heading2,
  Heading3,
  Link2,
  Minus,
  Table2,
} from 'lucide-react';
import { LINE_ICON_STROKE } from '../../ui';

function ToolbarButton({
  active,
  disabled,
  onClick,
  label,
  children,
}: {
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
  label: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      aria-label={label}
      title={label}
      className={`
        p-1.5 rounded-md transition-colors
        ${disabled ? 'opacity-40 cursor-not-allowed' : ''}
        ${
          active
            ? 'bg-[var(--nav-active-bg)] text-[var(--nav-active-fg)]'
            : 'text-[var(--text-subtle)] hover:text-[var(--text)] hover:bg-[var(--panel-2)]'
        }
      `}
    >
      {children}
    </button>
  );
}

export interface WikiEditorToolbarProps {
  editor: Editor | null;
}

export function WikiEditorToolbar({ editor }: WikiEditorToolbarProps) {
  if (!editor) return null;

  const setLink = () => {
    const prev = editor.getAttributes('link').href as string | undefined;
    const url = window.prompt('Link URL', prev || 'https://');
    if (url === null) return;
    if (url === '') {
      editor.chain().focus().extendMarkRange('link').unsetLink().run();
      return;
    }
    editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
  };

  const icon = 16;

  return (
    <div
      className="flex flex-wrap items-center gap-0.5 px-2 py-1.5 border-b border-[var(--panel-border)] bg-[var(--panel-2)]/40"
      role="toolbar"
      aria-label="Formatting"
    >
      <ToolbarButton
        label="Heading 1"
        active={editor.isActive('heading', { level: 1 })}
        onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
      >
        <Heading1 size={icon} strokeWidth={LINE_ICON_STROKE} />
      </ToolbarButton>
      <ToolbarButton
        label="Heading 2"
        active={editor.isActive('heading', { level: 2 })}
        onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
      >
        <Heading2 size={icon} strokeWidth={LINE_ICON_STROKE} />
      </ToolbarButton>
      <ToolbarButton
        label="Heading 3"
        active={editor.isActive('heading', { level: 3 })}
        onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
      >
        <Heading3 size={icon} strokeWidth={LINE_ICON_STROKE} />
      </ToolbarButton>

      <span className="w-px h-5 bg-[var(--panel-border)] mx-0.5" aria-hidden />

      <ToolbarButton
        label="Bold"
        active={editor.isActive('bold')}
        onClick={() => editor.chain().focus().toggleBold().run()}
      >
        <Bold size={icon} strokeWidth={LINE_ICON_STROKE} />
      </ToolbarButton>
      <ToolbarButton
        label="Italic"
        active={editor.isActive('italic')}
        onClick={() => editor.chain().focus().toggleItalic().run()}
      >
        <Italic size={icon} strokeWidth={LINE_ICON_STROKE} />
      </ToolbarButton>
      <ToolbarButton
        label="Strikethrough"
        active={editor.isActive('strike')}
        onClick={() => editor.chain().focus().toggleStrike().run()}
      >
        <Strikethrough size={icon} strokeWidth={LINE_ICON_STROKE} />
      </ToolbarButton>

      <span className="w-px h-5 bg-[var(--panel-border)] mx-0.5" aria-hidden />

      <ToolbarButton
        label="Bullet list"
        active={editor.isActive('bulletList')}
        onClick={() => editor.chain().focus().toggleBulletList().run()}
      >
        <List size={icon} strokeWidth={LINE_ICON_STROKE} />
      </ToolbarButton>
      <ToolbarButton
        label="Numbered list"
        active={editor.isActive('orderedList')}
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
      >
        <ListOrdered size={icon} strokeWidth={LINE_ICON_STROKE} />
      </ToolbarButton>
      <ToolbarButton
        label="Quote"
        active={editor.isActive('blockquote')}
        onClick={() => editor.chain().focus().toggleBlockquote().run()}
      >
        <Quote size={icon} strokeWidth={LINE_ICON_STROKE} />
      </ToolbarButton>
      <ToolbarButton
        label="Code block"
        active={editor.isActive('codeBlock')}
        onClick={() => editor.chain().focus().toggleCodeBlock().run()}
      >
        <Code size={icon} strokeWidth={LINE_ICON_STROKE} />
      </ToolbarButton>
      <ToolbarButton
        label="Horizontal rule"
        onClick={() => editor.chain().focus().setHorizontalRule().run()}
      >
        <Minus size={icon} strokeWidth={LINE_ICON_STROKE} />
      </ToolbarButton>

      <span className="w-px h-5 bg-[var(--panel-border)] mx-0.5" aria-hidden />

      <ToolbarButton
        label="Link"
        active={editor.isActive('link')}
        onClick={setLink}
      >
        <Link2 size={icon} strokeWidth={LINE_ICON_STROKE} />
      </ToolbarButton>
      <ToolbarButton
        label="Insert table"
        onClick={() =>
          editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()
        }
      >
        <Table2 size={icon} strokeWidth={LINE_ICON_STROKE} />
      </ToolbarButton>
    </div>
  );
}
