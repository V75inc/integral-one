import { useEffect, useState } from 'react';

import { attachmentsApi } from '../../api/attachments';
import { entriesApi } from '../../api/entries';
import { useToast } from '../../context/ToastContext';
import type { Attachment, Entry } from '../../types';
import { Surface, Text } from '../../ui';
import { Button } from '../ui/Button';
import { readSheets, squareGrid, writeSheets, type SheetGrid } from '../../utils/spreadsheetFile';
import { useAttachmentBlob } from './attachments/viewers/useAttachmentBlob';

/**
 * Edit a spreadsheet file (csv, xlsx) as a grid. Saving uploads the edited file as a
 * new version, points the entry's file at it and keeps the earlier version in the list.
 */
export function SpreadsheetEditor({
  entry, attachment, canEdit, onSaved,
}: {
  entry: Entry;
  attachment: Attachment;
  canEdit: boolean;
  onSaved?(entry: Entry, file: Attachment): void;
}) {
  const { showToast } = useToast();
  const { blob, loading, error } = useAttachmentBlob(attachment.id, 'download');
  const [sheets, setSheets] = useState<SheetGrid[] | null>(null);
  const [active, setActive] = useState(0);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [readError, setReadError] = useState('');

  useEffect(() => {
    setSheets(null); setDirty(false); setReadError('');
    if (!blob) return;
    let live = true;
    blob.arrayBuffer().then(readSheets).then(s => { if (live) { setSheets(s.length ? s : [{ name: 'Sheet1', rows: [['']] }]); setActive(0); } })
      .catch(e => { if (live) setReadError(e instanceof Error ? e.message : 'This file could not be read.'); });
    return () => { live = false; };
  }, [blob]);

  if (loading || (!sheets && !error && !readError)) return <div className="p-6 text-sm text-[var(--text-muted)]">Opening the file…</div>;
  if (error || readError || !sheets) return <div className="p-6 text-sm text-[var(--danger-text)]">{error || readError || 'This file could not be opened.'}</div>;

  const sheet = sheets[active] ?? sheets[0];
  const change = (next: string[][]) => {
    setSheets(sheets.map((s, i) => (i === active ? { ...s, rows: next } : s)));
    setDirty(true);
  };
  const setCell = (r: number, c: number, v: string) => change(sheet.rows.map((row, ri) => (ri === r ? row.map((x, ci) => (ci === c ? v : x)) : row)));
  const addRow = (at: number) => change([...sheet.rows.slice(0, at), Array(sheet.rows[0]?.length || 1).fill(''), ...sheet.rows.slice(at)]);
  const delRow = (at: number) => change(sheet.rows.length > 1 ? sheet.rows.filter((_, i) => i !== at) : sheet.rows);
  const addCol = () => change(squareGrid(sheet.rows.map(r => [...r, ''])));
  const delCol = (at: number) => change(sheet.rows[0]?.length > 1 ? sheet.rows.map(r => r.filter((_, i) => i !== at)) : sheet.rows);

  const save = async () => {
    setSaving(true);
    try {
      const name = attachment.filename || 'file.csv';
      const out = await writeSheets(sheets, name);
      const file = await attachmentsApi.uploadForEntry(entry.id, new File([out], name, { type: out.type }));
      const updated = await entriesApi.update(entry.id, {
        custom_fields: { ...(entry.custom_fields || {}), rendered_file: file.id, edited_by_hand: true },
      });
      setDirty(false);
      showToast('Saved. The earlier version is still in the file list.', 'success');
      onSaved?.(updated, file as Attachment);
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Saving failed. Your changes are still here.', 'error');
    } finally { setSaving(false); }
  };

  return (
    <Surface className="flex h-full min-h-0 flex-col overflow-hidden">
      <div className="flex flex-wrap items-center gap-2 border-b border-[var(--panel-border)] px-3 py-2">
        {sheets.length > 1 ? sheets.map((s, i) => (
          <button key={i} type="button" onClick={() => setActive(i)} className={`rounded-[var(--radius-input)] px-2 py-1 text-xs ${i === active ? 'bg-[var(--nav-active-bg)] font-medium' : 'text-[var(--text-muted)]'}`}>{s.name}</button>
        )) : null}
        <Text as="span" variant="body-sm" tone="muted">{sheet.rows.length} rows · {sheet.rows[0]?.length || 0} columns</Text>
        <div className="ml-auto flex items-center gap-2">
          {canEdit ? <Button type="button" variant="ghost" size="xs" onClick={addCol}>Add column</Button> : null}
          {canEdit ? <Button type="button" variant="ghost" size="xs" onClick={() => addRow(sheet.rows.length)}>Add row</Button> : null}
          {canEdit ? <Button type="button" size="xs" disabled={!dirty || saving} onClick={() => void save()}>{saving ? 'Saving…' : 'Save'}</Button> : null}
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-auto bg-[var(--panel)]" data-testid="spreadsheet-grid">
        <table className="w-max min-w-full border-collapse text-xs text-[var(--text)]">
          <tbody>
            {sheet.rows.map((row, r) => (
              <tr key={r} className="group">
                <td className="sticky left-0 z-[1] w-14 border-b border-r border-[var(--panel-border)] bg-[var(--panel-2)] px-2 text-center text-[var(--text-subtle)]">
                  {r + 1}
                  {canEdit ? <button type="button" aria-label={`Delete row ${r + 1}`} className="ml-1 hidden text-[var(--text-subtle)] hover:text-[var(--danger-text)] group-hover:inline" onClick={() => delRow(r)}>×</button> : null}
                </td>
                {row.map((v, c) => (
                  <td key={c} className={`border-b border-r border-[var(--panel-border)] p-0 ${r === 0 ? 'bg-[var(--panel-2)] font-semibold' : ''}`}>
                    <input
                      value={v}
                      readOnly={!canEdit}
                      aria-label={`Row ${r + 1} column ${c + 1}`}
                      onChange={e => setCell(r, c, e.target.value)}
                      className="min-w-[8rem] bg-transparent px-2 py-1.5 outline-none focus:bg-[var(--brand-accent-soft)]"
                    />
                  </td>
                ))}
                {r === 0 && canEdit ? <td className="border-b border-[var(--panel-border)] px-2 text-[var(--text-subtle)]"><button type="button" onClick={() => delCol(row.length - 1)} title="Delete the last column">− column</button></td> : null}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Surface>
  );
}
