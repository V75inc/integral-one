import type { ReactNode } from 'react';
import type { Editor } from '@tiptap/core';
import { useEditorState } from '@tiptap/react';
import {
  Bold,
  Code,
  Eraser,
  Outdent,
  Indent,
  Italic,
  Link2,
  List,
  ListOrdered,
  Minus,
  Quote,
  Redo2,
  Strikethrough,
  Table2,
  Undo2,
} from 'lucide-react';
import { LINE_ICON_STROKE } from '../../ui';

function Btn({
  label,
  active,
  disabled,
  onClick,
  children,
}: {
  label: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active}
      disabled={disabled}
      // Keep the selection in the document when a toolbar button is pressed.
      onMouseDown={e => e.preventDefault()}
      onClick={onClick}
      className={`doc-tool ${active ? 'is-active' : ''}`}
    >
      {children}
    </button>
  );
}

const Sep = () => <span className="doc-tool-sep" aria-hidden />;

type StyleValue = 'p' | 'h1' | 'h2' | 'h3';

export function DocumentToolbar({ editor }: { editor: Editor | null }) {
  const state = useEditorState({
    editor,
    selector: ({ editor: ed }) => ({
      style: !ed
        ? 'p'
        : ed.isActive('heading', { level: 1 })
          ? 'h1'
          : ed.isActive('heading', { level: 2 })
            ? 'h2'
            : ed.isActive('heading', { level: 3 })
              ? 'h3'
              : 'p',
      bold: !!ed?.isActive('bold'),
      italic: !!ed?.isActive('italic'),
      strike: !!ed?.isActive('strike'),
      code: !!ed?.isActive('code'),
      bullet: !!ed?.isActive('bulletList'),
      ordered: !!ed?.isActive('orderedList'),
      quote: !!ed?.isActive('blockquote'),
      link: !!ed?.isActive('link'),
      inTable: !!ed?.isActive('table'),
      canUndo: !!ed?.can().undo(),
      canRedo: !!ed?.can().redo(),
    }),
  });
  if (!editor || !state) return null;
  const icon = 16;
  const chain = () => editor.chain().focus();

  const setStyle = (value: StyleValue) => {
    if (value === 'p') chain().setParagraph().run();
    else chain().setHeading({ level: Number(value[1]) as 1 | 2 | 3 }).run();
  };

  const setLink = () => {
    const prev = editor.getAttributes('link').href as string | undefined;
    const url = window.prompt('Link address', prev || 'https://');
    if (url === null) return;
    if (url === '') chain().extendMarkRange('link').unsetLink().run();
    else chain().extendMarkRange('link').setLink({ href: url }).run();
  };

  return (
    <div className="doc-toolbar" role="toolbar" aria-label="Document formatting">
      <Btn label="Undo" disabled={!state.canUndo} onClick={() => chain().undo().run()}>
        <Undo2 size={icon} strokeWidth={LINE_ICON_STROKE} />
      </Btn>
      <Btn label="Redo" disabled={!state.canRedo} onClick={() => chain().redo().run()}>
        <Redo2 size={icon} strokeWidth={LINE_ICON_STROKE} />
      </Btn>
      <Sep />
      <select
        aria-label="Text style"
        className="doc-style-select"
        value={state.style}
        onChange={e => setStyle(e.target.value as StyleValue)}
      >
        <option value="p">Normal text</option>
        <option value="h1">Heading 1</option>
        <option value="h2">Heading 2</option>
        <option value="h3">Heading 3</option>
      </select>
      <Sep />
      <Btn label="Bold" active={state.bold} onClick={() => chain().toggleBold().run()}>
        <Bold size={icon} strokeWidth={LINE_ICON_STROKE} />
      </Btn>
      <Btn label="Italic" active={state.italic} onClick={() => chain().toggleItalic().run()}>
        <Italic size={icon} strokeWidth={LINE_ICON_STROKE} />
      </Btn>
      <Btn label="Strikethrough" active={state.strike} onClick={() => chain().toggleStrike().run()}>
        <Strikethrough size={icon} strokeWidth={LINE_ICON_STROKE} />
      </Btn>
      <Btn label="Code" active={state.code} onClick={() => chain().toggleCode().run()}>
        <Code size={icon} strokeWidth={LINE_ICON_STROKE} />
      </Btn>
      <Btn label="Link" active={state.link} onClick={setLink}>
        <Link2 size={icon} strokeWidth={LINE_ICON_STROKE} />
      </Btn>
      <Sep />
      <Btn label="Bulleted list" active={state.bullet} onClick={() => chain().toggleBulletList().run()}>
        <List size={icon} strokeWidth={LINE_ICON_STROKE} />
      </Btn>
      <Btn label="Numbered list" active={state.ordered} onClick={() => chain().toggleOrderedList().run()}>
        <ListOrdered size={icon} strokeWidth={LINE_ICON_STROKE} />
      </Btn>
      <Btn
        label="Indent"
        disabled={!(state.bullet || state.ordered)}
        onClick={() => chain().sinkListItem('listItem').run()}
      >
        <Indent size={icon} strokeWidth={LINE_ICON_STROKE} />
      </Btn>
      <Btn
        label="Outdent"
        disabled={!(state.bullet || state.ordered)}
        onClick={() => chain().liftListItem('listItem').run()}
      >
        <Outdent size={icon} strokeWidth={LINE_ICON_STROKE} />
      </Btn>
      <Sep />
      <Btn label="Callout" active={state.quote} onClick={() => chain().toggleBlockquote().run()}>
        <Quote size={icon} strokeWidth={LINE_ICON_STROKE} />
      </Btn>
      <Btn label="Divider" onClick={() => chain().setHorizontalRule().run()}>
        <Minus size={icon} strokeWidth={LINE_ICON_STROKE} />
      </Btn>
      <Btn
        label="Insert table"
        disabled={state.inTable}
        onClick={() => chain().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}
      >
        <Table2 size={icon} strokeWidth={LINE_ICON_STROKE} />
      </Btn>
      {state.inTable ? (
        <span className="doc-table-tools" role="group" aria-label="Table">
          <button type="button" className="doc-pill" onMouseDown={e => e.preventDefault()} onClick={() => chain().addRowAfter().run()}>
            + Row
          </button>
          <button type="button" className="doc-pill" onMouseDown={e => e.preventDefault()} onClick={() => chain().addColumnAfter().run()}>
            + Column
          </button>
          <button type="button" className="doc-pill" onMouseDown={e => e.preventDefault()} onClick={() => chain().deleteRow().run()}>
            − Row
          </button>
          <button type="button" className="doc-pill" onMouseDown={e => e.preventDefault()} onClick={() => chain().deleteColumn().run()}>
            − Column
          </button>
          <button type="button" className="doc-pill danger" onMouseDown={e => e.preventDefault()} onClick={() => chain().deleteTable().run()}>
            Delete table
          </button>
        </span>
      ) : null}
      <Sep />
      <Btn label="Clear formatting" onClick={() => chain().unsetAllMarks().clearNodes().run()}>
        <Eraser size={icon} strokeWidth={LINE_ICON_STROKE} />
      </Btn>
    </div>
  );
}
