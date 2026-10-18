import { useCallback, useEffect, useMemo, useRef } from 'react';
import { EditorContent, useEditor, type Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import Link from '@tiptap/extension-link';
import TextAlign from '@tiptap/extension-text-align';
import Underline from '@tiptap/extension-underline';
import { TextStyle } from '@tiptap/extension-text-style';
import Color from '@tiptap/extension-color';
import Highlight from '@tiptap/extension-highlight';
import { Table } from '@tiptap/extension-table';
import { TableRow } from '@tiptap/extension-table-row';
import { TableCell } from '@tiptap/extension-table-cell';
import { TableHeader } from '@tiptap/extension-table-header';
import {
  BlockLayout,
  ConditionalSection,
  FieldToken,
  PageBreak,
  RepeatSection,
  SignaturePlaceholder,
} from './extensions';
import { DocumentEditorToolbar } from './DocumentEditorToolbar';
import {
  BlockTextAlignFromStyle,
  PreservePasteFormatting,
  normalizePastedHtml,
} from './pasteFormatting';
import { FontFamily, FontSize } from './typographyExtensions';
import { scrollDocEditorSelectionIntoView } from './scrollSelectionIntoView';
import {
  DEFAULT_MARGINS_IN,
  DEFAULT_PAGE_SIZE,
  pageContentBoxStyle,
  pageWidthPx,
  type MarginsInches,
  type PageSizeKey,
} from '../documentTheme';

/** Horizontal padding inside `.doc-editor-scroll` (16px × 2). */
const DOC_EDITOR_SCROLL_PAD_X = 32;
import '../document-editor.css';

const EMPTY_DOC = {
  type: 'doc',
  content: [{ type: 'paragraph' }],
};

export interface DocumentTemplateEditorProps {
  value: Record<string, unknown>;
  onChange: (doc: Record<string, unknown>) => void;
  onSelectToken?: (attrs: Record<string, unknown> | null) => void;
  onSelectSignature?: (attrs: Record<string, unknown> | null) => void;
  onEditorReady?: (editor: Editor) => void;
  placeholder?: string;
  pageSize?: PageSizeKey;
  margins?: MarginsInches;
}

export function DocumentTemplateEditor({
  value,
  onChange,
  onSelectToken,
  onSelectSignature,
  onEditorReady,
  placeholder,
  pageSize = DEFAULT_PAGE_SIZE,
  margins = DEFAULT_MARGINS_IN,
}: DocumentTemplateEditorProps) {
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const onSelectRef = useRef(onSelectToken);
  onSelectRef.current = onSelectToken;
  const onSelectSigRef = useRef(onSelectSignature);
  onSelectSigRef.current = onSelectSignature;
  const onReadyRef = useRef(onEditorReady);
  onReadyRef.current = onEditorReady;
  const extensions = useMemo(
    () => [
      StarterKit.configure({ heading: { levels: [1, 2, 3] } }),
      TextStyle,
      Color,
      Highlight.configure({ multicolor: true }),
      FontFamily,
      FontSize,
      Underline,
      TextAlign.configure({
        types: ['heading', 'paragraph', 'blockquote', 'tableCell', 'tableHeader'],
      }),
      BlockTextAlignFromStyle,
      BlockLayout,
      Link.configure({ openOnClick: false }),
      Placeholder.configure({
        placeholder: placeholder || 'Start writing your template…',
      }),
      Table.configure({ resizable: true }),
      TableRow,
      TableHeader,
      TableCell,
      FieldToken,
      PageBreak,
      SignaturePlaceholder,
      RepeatSection,
      ConditionalSection,
      PreservePasteFormatting,
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const editor = useEditor(
    {
      extensions,
      content: value && Object.keys(value).length ? value : EMPTY_DOC,
      immediatelyRender: false,
      onUpdate: ({ editor: ed }) => {
        onChangeRef.current(ed.getJSON() as Record<string, unknown>);
      },
      onSelectionUpdate: ({ editor: ed }) => {
        const { selection } = ed.state;
        const node = ed.state.doc.nodeAt(selection.from);
        if (node?.type.name === 'fieldToken') {
          onSelectRef.current?.(node.attrs as Record<string, unknown>);
          onSelectSigRef.current?.(null);
        } else if (node?.type.name === 'signaturePlaceholder') {
          onSelectSigRef.current?.(node.attrs as Record<string, unknown>);
          onSelectRef.current?.(null);
        } else {
          onSelectRef.current?.(null);
          onSelectSigRef.current?.(null);
        }
      },
      editorProps: {
        attributes: {
          class: 'doc-template-prose',
          'aria-label': 'Document template body',
        },
        transformPastedHTML: normalizePastedHtml,
        handleScrollToSelection: scrollDocEditorSelectionIntoView,
      },
    },
    [extensions],
  );

  useEffect(() => {
    if (editor) onReadyRef.current?.(editor);
  }, [editor]);

  useEffect(() => {
    if (!editor || !value) return;
    const current = JSON.stringify(editor.getJSON());
    const next = JSON.stringify(value);
    if (current !== next && !editor.isFocused) {
      editor.commands.setContent(value, { emitUpdate: false });
    }
  }, [editor, value]);

  const pageStyle = useMemo(
    () => pageContentBoxStyle(pageSize, margins),
    [pageSize, margins],
  );
  const naturalPageWidth = useMemo(() => pageWidthPx(pageSize), [pageSize]);

  const scrollRef = useRef<HTMLDivElement>(null);
  const pageRef = useRef<HTMLDivElement>(null);

  const syncPageFit = useCallback(() => {
    const scroll = scrollRef.current;
    const page = pageRef.current;
    if (!scroll || !page) return;

    const host = scroll.parentElement;
    const hostWidth = host?.clientWidth || scroll.clientWidth;
    const avail = Math.max(0, hostWidth - DOC_EDITOR_SCROLL_PAD_X);
    // Fit the sheet to the editor. A landscape page must not widen the column.
    const scale = avail <= 0 ? 1 : Math.min(1, avail / naturalPageWidth);
    const rounded = Math.round(scale * 1000) / 1000;

    /* `zoom` shrinks layout + hit targets together (transform breaks TipTap clicks). */
    page.style.zoom = rounded >= 1 ? '' : String(rounded);
  }, [naturalPageWidth]);

  useEffect(() => {
    const scroll = scrollRef.current;
    if (!scroll) return;
    const ro = new ResizeObserver(() => syncPageFit());
    ro.observe(scroll);
    syncPageFit();
    return () => ro.disconnect();
  }, [syncPageFit]);

  useEffect(() => {
    if (!editor) return;
    const onLayout = () => {
      requestAnimationFrame(() => syncPageFit());
    };
    editor.on('update', onLayout);
    editor.on('selectionUpdate', onLayout);
    syncPageFit();
    return () => {
      editor.off('update', onLayout);
      editor.off('selectionUpdate', onLayout);
    };
  }, [editor, syncPageFit]);

  useEffect(() => {
    syncPageFit();
  }, [pageSize, margins, syncPageFit]);

  if (!editor) {
    return (
      <div className="doc-template-editor doc-template-editor--loading">
        Loading editor…
      </div>
    );
  }

  return (
    <div className="doc-template-editor">
      <DocumentEditorToolbar editor={editor} />
      <div ref={scrollRef} className="doc-editor-scroll">
        <div ref={pageRef} className="doc-page" style={pageStyle}>
          <EditorContent editor={editor} />
        </div>
      </div>
    </div>
  );
}
