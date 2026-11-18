/** Read and write spreadsheet files (xlsx, xls, csv) as plain grids of text, for the in-app grid editor. */
export interface SheetGrid { name: string; rows: string[][] }

export function isSpreadsheetName(name: string, mime = ''): boolean {
  return /\.(csv|xlsx|xls)$/i.test(name) || /spreadsheet|excel|text\/csv/i.test(mime);
}

const cell = (v: unknown): string => (v == null ? '' : String(v));

/** Make every row the same width so the grid is rectangular. */
export function squareGrid(rows: string[][]): string[][] {
  const width = rows.reduce((m, r) => Math.max(m, r.length), 0);
  return rows.map(r => Array.from({ length: width }, (_, i) => cell(r[i])));
}

export async function readSheets(buf: ArrayBuffer): Promise<SheetGrid[]> {
  const XLSX = await import('xlsx');
  const wb = XLSX.read(buf, { type: 'array', raw: true });
  return wb.SheetNames.map(name => {
    const ws = wb.Sheets[name];
    const rows = ws ? (XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: '', blankrows: false }) as unknown[][]) : [];
    return { name, rows: squareGrid(rows.map(r => r.map(cell))) };
  });
}

export async function writeSheets(sheets: SheetGrid[], filename: string): Promise<Blob> {
  const XLSX = await import('xlsx');
  const wb = XLSX.utils.book_new();
  for (const s of sheets) XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(s.rows), s.name.slice(0, 31) || 'Sheet1');
  if (/\.csv$/i.test(filename)) {
    const csv = XLSX.utils.sheet_to_csv(wb.Sheets[wb.SheetNames[0]]);
    return new Blob([csv.endsWith('\n') ? csv : csv + '\n'], { type: 'text/csv' });
  }
  const out = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
  return new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}
