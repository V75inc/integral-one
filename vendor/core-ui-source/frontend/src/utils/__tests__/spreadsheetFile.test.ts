import { describe, expect, it } from 'vitest';
import { isSpreadsheetName, readSheets, squareGrid, writeSheets } from '../spreadsheetFile';

const bytes = (b: Blob) => new Promise<ArrayBuffer>((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result as ArrayBuffer); r.onerror = () => rej(r.error); r.readAsArrayBuffer(b); });

describe('spreadsheetFile', () => {
  it('detects spreadsheet names', () => {
    expect(isSpreadsheetName('a.CSV')).toBe(true);
    expect(isSpreadsheetName('a.pdf')).toBe(false);
  });
  it('squares ragged rows', () => {
    expect(squareGrid([['a'], ['b', 'c']])).toEqual([['a', ''], ['b', 'c']]);
  });
  it('round-trips a csv with commas and quotes', async () => {
    const rows = [['TIN', 'Name'], ['1', 'Demerara, "Ltd"']];
    const blob = await writeSheets([{ name: 'S', rows }], 'x.csv');
    const back = await readSheets(await bytes(blob));
    expect(back[0].rows).toEqual(rows);
  });
  it('round-trips an xlsx', async () => {
    const rows = [['a', 'b'], ['1', '2']];
    const blob = await writeSheets([{ name: 'Data', rows }], 'x.xlsx');
    const back = await readSheets(await bytes(blob));
    expect(back[0].name).toBe('Data');
    expect(back[0].rows).toEqual(rows);
  });
});
