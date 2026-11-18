import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { Table } from '@tiptap/extension-table';
import { TableCell } from '@tiptap/extension-table-cell';
import { TableHeader } from '@tiptap/extension-table-header';
import { afterEach, describe, expect, it } from 'vitest';

import { RepeatSection, RepeatTableRow } from '../extensions';

const cell = (type: 'tableCell' | 'tableHeader', text: string) => ({
  type,
  content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
});

const payslipTable = {
  type: 'doc',
  content: [
    {
      type: 'table',
      content: [
        { type: 'tableRow', content: [cell('tableHeader', 'Item'), cell('tableHeader', 'Amount')] },
        {
          type: 'tableRow',
          attrs: { repeat: 'earnings' },
          content: [cell('tableCell', 'label'), cell('tableCell', 'amount')],
        },
      ],
    },
  ],
};

type Node = { type: string; attrs?: Record<string, unknown>; content?: Node[] };
const asNode = (n: unknown) => n as Node;

const editors = new Set<Editor>();
afterEach(() => {
  // ProseMirror observes DOM changes asynchronously. Destroy every standalone
  // test editor before jsdom removes its document and pending observers flush.
  for (const editor of editors) editor.destroy();
  editors.clear();
});

function editorFor(content: unknown) {
  const editor = new Editor({
    extensions: [StarterKit, Table, RepeatTableRow, TableHeader, TableCell, RepeatSection],
    content: content as Record<string, unknown>,
  });
  editors.add(editor);
  return editor;
}

describe('repeating table rows', () => {
  it('keeps the table whole and keeps the repeat name on the data row', () => {
    const json = editorFor(payslipTable).getJSON();
    expect(json.content).toHaveLength(1);
    const table = asNode(json.content![0]);
    expect(table.type).toBe('table');
    expect(table.content).toHaveLength(2);
    expect(table.content![0].attrs?.repeat ?? null).toBeNull();
    expect(table.content![1].attrs?.repeat).toBe('earnings');
  });

  it('survives an edit and a save (JSON in, JSON out)', () => {
    const editor = editorFor(payslipTable);
    editor.commands.setContent(editor.getJSON());
    expect(asNode(editor.getJSON().content![0]).content![1].attrs?.repeat).toBe('earnings');
  });

  it('renders the repeat on the row so it can be styled', () => {
    const editor = editorFor(payslipTable);
    expect(editor.getHTML()).toContain('data-repeat="earnings"');
  });
});

describe('repeat block collection name', () => {
  it('keeps the collection name the templates and renderer use', () => {
    const doc = {
      type: 'doc',
      content: [
        { type: 'repeatSection', attrs: { collection: 'earnings' }, content: [{ type: 'paragraph' }] },
      ],
    };
    const json = editorFor(doc).getJSON();
    expect(asNode(json.content![0]).attrs?.collection).toBe('earnings');
  });
});
