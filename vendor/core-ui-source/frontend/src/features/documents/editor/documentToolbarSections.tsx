import { useRef, type ReactNode } from 'react';
import type { Editor } from '@tiptap/react';
import {
  AlignCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
  Bold,
  Calendar,
  FileSignature,
  GitBranch,
  Highlighter,
  Indent,
  Italic,
  Link2,
  List,
  ListOrdered,
  Outdent,
  Palette,
  PanelTop,
  Repeat,
  Stamp,
  Strikethrough,
  Underline,
  X,
} from 'lucide-react';
import { LINE_ICON_STROKE } from '../../../components/ui';
import { FONT_FAMILY_OPTIONS, FONT_SIZE_OPTIONS } from '../documentTheme';
import { LINE_HEIGHT_OPTIONS } from './extensions';
import { TableInsertControl } from './TableInsertControl';

const ICON = 16;

export function ToolbarGroup({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="doc-toolbar-group" role="group" aria-label={label}>
      <span className="doc-toolbar-group-label">{label}</span>
      <div className="doc-toolbar-group-body">{children}</div>
    </div>
  );
}

export function IconBtn({
  onClick,
  active,
  title,
  children,
}: {
  onClick: () => void;
  active?: boolean;
  title: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      aria-pressed={active}
      onClick={onClick}
      className={'doc-toolbar-btn' + (active ? ' doc-toolbar-btn--active' : '')}
    >
      {children}
    </button>
  );
}

function normalizeHex(raw: string, fallback: string): string {
  const v = (raw || fallback).trim();
  if (/^#[0-9a-fA-F]{6}$/.test(v)) return v;
  if (/^#[0-9a-fA-F]{3}$/.test(v)) return v;
  return fallback;
}

function ColorControl({
  title,
  value,
  onPick,
  onClear,
  icon,
  active,
}: {
  title: string;
  value: string;
  onPick: (hex: string) => void;
  onClear: () => void;
  icon: ReactNode;
  active?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const hex = normalizeHex(value, '#000000');

  return (
    <div className="doc-toolbar-color">
      <IconBtn
        title={`${title} — click to choose color`}
        active={active}
        onClick={() => inputRef.current?.click()}
      >
        <span className="doc-toolbar-color-icon">{icon}</span>
        <span
          className="doc-toolbar-color-bar"
          style={{ backgroundColor: hex }}
          aria-hidden
        />
      </IconBtn>
      <input
        ref={inputRef}
        type="color"
        className="doc-toolbar-color-input"
        value={hex}
        aria-label={title}
        onChange={e => onPick(e.target.value)}
      />
      <button
        type="button"
        className="doc-toolbar-color-reset"
        title={`Clear ${title.toLowerCase()}`}
        aria-label={`Clear ${title.toLowerCase()}`}
        onClick={onClear}
      >
        <X size={14} strokeWidth={LINE_ICON_STROKE} aria-hidden />
      </button>
    </div>
  );
}

function InsertChip({
  label,
  title,
  icon,
  onClick,
}: {
  label: string;
  title: string;
  icon: ReactNode;
  onClick: () => void;
}) {
  return (
    <button type="button" className="doc-toolbar-insert" title={title} onClick={onClick}>
      <span className="doc-toolbar-insert-icon" aria-hidden>
        {icon}
      </span>
      <span className="doc-toolbar-insert-label">{label}</span>
    </button>
  );
}

function blockStyleValue(editor: Editor): string {
  if (editor.isActive('heading', { level: 1 })) return 'h1';
  if (editor.isActive('heading', { level: 2 })) return 'h2';
  if (editor.isActive('heading', { level: 3 })) return 'h3';
  if (editor.isActive('blockquote')) return 'quote';
  return 'paragraph';
}

function applyBlockStyle(editor: Editor, value: string) {
  const chain = editor.chain().focus();
  switch (value) {
    case 'h1':
      chain.setHeading({ level: 1 }).run();
      break;
    case 'h2':
      chain.setHeading({ level: 2 }).run();
      break;
    case 'h3':
      chain.setHeading({ level: 3 }).run();
      break;
    case 'quote':
      chain.setBlockquote().run();
      break;
    default:
      chain.setParagraph().run();
      break;
  }
}

export type CompactToolbarTab = 'text' | 'format' | 'layout' | 'insert';

export function DocumentToolbarSections({
  editor,
  insertMySignature,
}: {
  editor: Editor;
  insertMySignature: () => void;
}) {
  const blockType = ['paragraph', 'heading', 'blockquote'].find(t =>
    editor.isActive(t),
  );
  const lineHeight = blockType
    ? String(editor.getAttributes(blockType).lineHeight || '')
    : '';
  const textStyle = editor.getAttributes('textStyle') as {
    fontFamily?: string;
    fontSize?: string;
    color?: string;
  };
  const fontFamily = textStyle.fontFamily || '';
  const fontSize = textStyle.fontSize || '11';
  const textColor = textStyle.color || '#111111';
  const highlightColor =
    (editor.getAttributes('highlight') as { color?: string }).color || '#fef08a';

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

  const textGroup = (
    <ToolbarGroup label="Text">
      <label className="doc-toolbar-select-wrap">
        <span className="sr-only">Paragraph style</span>
        <select
          className="doc-toolbar-select doc-toolbar-select--style"
          value={blockStyleValue(editor)}
          onChange={e => applyBlockStyle(editor, e.target.value)}
          aria-label="Paragraph style"
        >
          <option value="paragraph">Normal text</option>
          <option value="h1">Heading 1</option>
          <option value="h2">Heading 2</option>
          <option value="h3">Heading 3</option>
          <option value="quote">Quote</option>
        </select>
      </label>
      <label className="doc-toolbar-select-wrap">
        <span className="sr-only">Font</span>
        <select
          className="doc-toolbar-select doc-toolbar-select--wide"
          value={fontFamily}
          onChange={e => {
            const v = e.target.value;
            if (!v) editor.chain().focus().unsetFontFamily().run();
            else editor.chain().focus().setFontFamily(v).run();
          }}
          aria-label="Font"
        >
          {FONT_FAMILY_OPTIONS.map(opt => (
            <option key={`${opt.label}-${opt.value}`} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </label>
      <label className="doc-toolbar-select-wrap">
        <span className="sr-only">Font size</span>
        <select
          className="doc-toolbar-select doc-toolbar-select--size"
          value={fontSize}
          onChange={e => editor.chain().focus().setFontSize(e.target.value).run()}
          aria-label="Font size in points"
        >
          {FONT_SIZE_OPTIONS.map(size => (
            <option key={size} value={size}>
              {size} pt
            </option>
          ))}
        </select>
      </label>
    </ToolbarGroup>
  );

  const formatGroup = (
    <ToolbarGroup label="Format">
      <IconBtn
        title="Bold"
        active={editor.isActive('bold')}
        onClick={() => editor.chain().focus().toggleBold().run()}
      >
        <Bold size={ICON} strokeWidth={LINE_ICON_STROKE} />
      </IconBtn>
      <IconBtn
        title="Italic"
        active={editor.isActive('italic')}
        onClick={() => editor.chain().focus().toggleItalic().run()}
      >
        <Italic size={ICON} strokeWidth={LINE_ICON_STROKE} />
      </IconBtn>
      <IconBtn
        title="Underline"
        active={editor.isActive('underline')}
        onClick={() => editor.chain().focus().toggleUnderline().run()}
      >
        <Underline size={ICON} strokeWidth={LINE_ICON_STROKE} />
      </IconBtn>
      <IconBtn
        title="Strikethrough"
        active={editor.isActive('strike')}
        onClick={() => editor.chain().focus().toggleStrike().run()}
      >
        <Strikethrough size={ICON} strokeWidth={LINE_ICON_STROKE} />
      </IconBtn>
      <ColorControl
        title="Text color"
        value={textColor}
        active={Boolean(textStyle.color)}
        icon={<Palette size={ICON} strokeWidth={LINE_ICON_STROKE} />}
        onPick={hex => editor.chain().focus().setColor(hex).run()}
        onClear={() => editor.chain().focus().unsetColor().run()}
      />
      <ColorControl
        title="Highlight"
        value={highlightColor}
        active={editor.isActive('highlight')}
        icon={<Highlighter size={ICON} strokeWidth={LINE_ICON_STROKE} />}
        onPick={hex => editor.chain().focus().setHighlight({ color: hex }).run()}
        onClear={() => editor.chain().focus().unsetHighlight().run()}
      />
      <IconBtn title="Insert link" active={editor.isActive('link')} onClick={setLink}>
        <Link2 size={ICON} strokeWidth={LINE_ICON_STROKE} />
      </IconBtn>
    </ToolbarGroup>
  );

  const alignGroup = (
    <ToolbarGroup label="Align">
      <IconBtn
        title="Align left"
        active={editor.isActive({ textAlign: 'left' })}
        onClick={() => editor.chain().focus().setTextAlign('left').run()}
      >
        <AlignLeft size={ICON} strokeWidth={LINE_ICON_STROKE} />
      </IconBtn>
      <IconBtn
        title="Align center"
        active={editor.isActive({ textAlign: 'center' })}
        onClick={() => editor.chain().focus().setTextAlign('center').run()}
      >
        <AlignCenter size={ICON} strokeWidth={LINE_ICON_STROKE} />
      </IconBtn>
      <IconBtn
        title="Align right"
        active={editor.isActive({ textAlign: 'right' })}
        onClick={() => editor.chain().focus().setTextAlign('right').run()}
      >
        <AlignRight size={ICON} strokeWidth={LINE_ICON_STROKE} />
      </IconBtn>
      <IconBtn
        title="Justify"
        active={editor.isActive({ textAlign: 'justify' })}
        onClick={() => editor.chain().focus().setTextAlign('justify').run()}
      >
        <AlignJustify size={ICON} strokeWidth={LINE_ICON_STROKE} />
      </IconBtn>
    </ToolbarGroup>
  );

  const spacingGroup = (
    <ToolbarGroup label="Spacing">
      <label className="doc-toolbar-select-wrap">
        <span className="sr-only">Line spacing</span>
        <select
          className="doc-toolbar-select doc-toolbar-select--spacing"
          value={lineHeight}
          onChange={e => {
            const next = e.target.value;
            if (!next) editor.chain().focus().unsetLineHeight().run();
            else editor.chain().focus().setLineHeight(next).run();
          }}
          aria-label="Line spacing"
        >
          {LINE_HEIGHT_OPTIONS.map(opt => (
            <option key={opt.value || 'default'} value={opt.value}>
              {opt.label === 'Line spacing' ? 'Default' : opt.label}
            </option>
          ))}
        </select>
      </label>
      <IconBtn title="Increase indent" onClick={() => editor.chain().focus().indent().run()}>
        <Indent size={ICON} strokeWidth={LINE_ICON_STROKE} />
      </IconBtn>
      <IconBtn title="Decrease indent" onClick={() => editor.chain().focus().outdent().run()}>
        <Outdent size={ICON} strokeWidth={LINE_ICON_STROKE} />
      </IconBtn>
    </ToolbarGroup>
  );

  const listsGroup = (
    <ToolbarGroup label="Lists">
      <IconBtn
        title="Bullet list"
        active={editor.isActive('bulletList')}
        onClick={() => editor.chain().focus().toggleBulletList().run()}
      >
        <List size={ICON} strokeWidth={LINE_ICON_STROKE} />
      </IconBtn>
      <IconBtn
        title="Numbered list"
        active={editor.isActive('orderedList')}
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
      >
        <ListOrdered size={ICON} strokeWidth={LINE_ICON_STROKE} />
      </IconBtn>
      <TableInsertControl editor={editor} />
    </ToolbarGroup>
  );

  const insertGroup = (
    <ToolbarGroup label="Insert">
      <InsertChip
        label="Page break"
        title="Start a new page when this document is printed or exported to PDF"
        icon={<PanelTop size={ICON} strokeWidth={LINE_ICON_STROKE} />}
        onClick={() => editor.chain().focus().insertContent({ type: 'pageBreak' }).run()}
      />
      <InsertChip
        label="Date"
        title="Insert today's date — filled in automatically when the document is generated"
        icon={<Calendar size={ICON} strokeWidth={LINE_ICON_STROKE} />}
        onClick={() =>
          editor.chain().focus().insertFieldToken({
            fieldKey: 'system.current_date',
            label: 'Current date',
            format: 'long',
          }).run()
        }
      />
      <InsertChip
        label="Sign here"
        title="Placeholder for someone to sign when they complete the form"
        icon={<FileSignature size={ICON} strokeWidth={LINE_ICON_STROKE} />}
        onClick={() =>
          editor.chain().focus().insertSignaturePlaceholder({
            role: 'signature',
            label: 'Signature',
            mode: 'runtime',
          }).run()
        }
      />
      <InsertChip
        label="My signature"
        title="Embed your saved signature image into every generated PDF"
        icon={<Stamp size={ICON} strokeWidth={LINE_ICON_STROKE} />}
        onClick={insertMySignature}
      />
      <InsertChip
        label="Repeat block"
        title="Repeat this section for each item in a list field (configure in sidebar)"
        icon={<Repeat size={ICON} strokeWidth={LINE_ICON_STROKE} />}
        onClick={() =>
          editor.chain().focus().insertContent({
            type: 'repeatSection',
            attrs: { collectionField: 'line_items' },
            content: [
              {
                type: 'paragraph',
                content: [{ type: 'text', text: 'Repeated row…' }],
              },
            ],
          }).run()
        }
      />
      <InsertChip
        label="Show if…"
        title="Only include this section when a field matches a value"
        icon={<GitBranch size={ICON} strokeWidth={LINE_ICON_STROKE} />}
        onClick={() =>
          editor.chain().focus().insertContent({
            type: 'conditionalSection',
            attrs: { conditionField: '', equals: '' },
            content: [
              {
                type: 'paragraph',
                content: [{ type: 'text', text: 'Shown when condition matches…' }],
              },
            ],
          }).run()
        }
      />
    </ToolbarGroup>
  );

  return {
    textGroup,
    formatGroup,
    alignGroup,
    spacingGroup,
    listsGroup,
    insertGroup,
  };
}
