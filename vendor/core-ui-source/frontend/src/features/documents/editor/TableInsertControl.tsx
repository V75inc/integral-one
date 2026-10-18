import { useCallback, useEffect, useRef, useState } from 'react';
import type { Editor } from '@tiptap/react';
import { Table2 } from 'lucide-react';
import { LINE_ICON_STROKE } from '../../../components/ui';
import { Button } from '../../../components/ui/Button';

const ICON = 16;
const GRID_MAX = 8;
const CUSTOM_ROWS_MAX = 30;
const CUSTOM_COLS_MAX = 12;

interface TableInsertControlProps {
  editor: Editor;
}

export function TableInsertControl({ editor }: TableInsertControlProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [hover, setHover] = useState({ rows: 0, cols: 0 });
  const [withHeaderRow, setWithHeaderRow] = useState(true);
  const [customRows, setCustomRows] = useState('4');
  const [customCols, setCustomCols] = useState('3');
  const [menuPos, setMenuPos] = useState({ top: 0, left: 0 });

  const reposition = useCallback(() => {
    const rect = btnRef.current?.getBoundingClientRect();
    if (!rect) return;
    const width = 280;
    let left = rect.left;
    const maxLeft = window.innerWidth - width - 8;
    if (left > maxLeft) left = Math.max(8, maxLeft);
    setMenuPos({ top: rect.bottom + 6, left });
  }, []);

  useEffect(() => {
    if (!open) return;
    reposition();
    const onScroll = () => reposition();
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onScroll);
    return () => {
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onScroll);
    };
  }, [open, reposition]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (wrapRef.current?.contains(target)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [open]);

  const insertTable = (rows: number, cols: number) => {
    if (rows < 1 || cols < 1) return;
    editor
      .chain()
      .focus()
      .insertTable({ rows, cols, withHeaderRow })
      .run();
    setOpen(false);
    setHover({ rows: 0, cols: 0 });
  };

  const preview =
    hover.rows > 0 && hover.cols > 0
      ? `${hover.cols} × ${hover.rows}`
      : 'Select size';

  const parseCustom = (): { rows: number; cols: number } | null => {
    const rows = parseInt(customRows, 10);
    const cols = parseInt(customCols, 10);
    if (
      !Number.isFinite(rows) ||
      !Number.isFinite(cols) ||
      rows < 1 ||
      cols < 1 ||
      rows > CUSTOM_ROWS_MAX ||
      cols > CUSTOM_COLS_MAX
    ) {
      return null;
    }
    return { rows, cols };
  };

  return (
    <div className="doc-toolbar-table-insert" ref={wrapRef}>
      <button
        ref={btnRef}
        type="button"
        title="Insert table"
        aria-label="Insert table"
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => setOpen(prev => !prev)}
        className={'doc-toolbar-btn' + (open ? ' doc-toolbar-btn--active' : '')}
      >
        <Table2 size={ICON} strokeWidth={LINE_ICON_STROKE} />
      </button>

      {open ? (
        <div
          className="doc-table-insert-popover"
          role="dialog"
          aria-label="Insert table"
          style={{ top: menuPos.top, left: menuPos.left }}
        >
          <p className="doc-table-insert-preview">{preview}</p>
          <div
            className="doc-table-insert-grid"
            onMouseLeave={() => setHover({ rows: 0, cols: 0 })}
          >
            {Array.from({ length: GRID_MAX }, (_, rowIdx) => {
              const row = rowIdx + 1;
              return Array.from({ length: GRID_MAX }, (_, colIdx) => {
                const col = colIdx + 1;
                const active = row <= hover.rows && col <= hover.cols;
                return (
                  <button
                    key={`${row}-${col}`}
                    type="button"
                    className={
                      'doc-table-insert-cell' +
                      (active ? ' doc-table-insert-cell--active' : '')
                    }
                    aria-label={`${col} columns by ${row} rows`}
                    onMouseEnter={() => setHover({ rows: row, cols: col })}
                    onClick={() => insertTable(row, col)}
                  />
                );
              });
            })}
          </div>
          <label className="doc-table-insert-header">
            <input
              type="checkbox"
              checked={withHeaderRow}
              onChange={e => setWithHeaderRow(e.target.checked)}
            />
            Header row
          </label>
          <div className="doc-table-insert-custom">
            <label className="doc-table-insert-field">
              <span className="doc-table-insert-field-label">Rows</span>
              <input
                type="number"
                min={1}
                max={CUSTOM_ROWS_MAX}
                value={customRows}
                onChange={e => setCustomRows(e.target.value)}
                className="doc-table-insert-input"
                aria-label="Table rows"
              />
            </label>
            <label className="doc-table-insert-field">
              <span className="doc-table-insert-field-label">Cols</span>
              <input
                type="number"
                min={1}
                max={CUSTOM_COLS_MAX}
                value={customCols}
                onChange={e => setCustomCols(e.target.value)}
                className="doc-table-insert-input"
                aria-label="Table columns"
              />
            </label>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={parseCustom() === null}
              onClick={() => {
                const parsed = parseCustom();
                if (parsed) insertTable(parsed.rows, parsed.cols);
              }}
            >
              Insert
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
