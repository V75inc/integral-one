import { useEffect, useState } from 'react';

import type { Attachment } from '../../../../types';
import { sanitizeHtml } from '../../../../utils/sanitizeHtml';
import { useAttachmentBlob } from './useAttachmentBlob';
import { ViewerStatus } from './ViewerStatus';

/**
 * xlsx / xls → paginated HTML table via SheetJS.
 *
 * Renders the first sheet by default with a tab strip for the rest.
 * The conversion runs client-side from the original bytes, so we
 * don't pay any server round trips after the initial blob fetch.
 * Large workbooks are capped at the first 500 rows per sheet to keep
 * the modal responsive — the metadata panel already shows the full
 * row count, and users who need to crunch the data can download the
 * file.
 */

const MAX_ROWS = 500;

interface SheetSummary {
  name: string;
  html: string;
  rowCount: number;
  truncated: boolean;
}

export function XlsxViewer({ attachment }: { attachment: Attachment }) {
  const { blob, loading, error } = useAttachmentBlob(attachment.id);
  const [sheets, setSheets] = useState<SheetSummary[] | null>(null);
  const [active, setActive] = useState(0);
  const [convertError, setConvertError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setSheets(null);
    setActive(0);
    setConvertError(null);
    if (!blob) return;

    (async () => {
      try {
        // SECURITY: the bytes below are attacker-controlled — any user who can
        // upload an attachment reaches this parser — so the SheetJS version
        // matters. Note the MAX_ROWS cap further down does NOT mitigate parser
        // advisories: it is applied after XLSX.read(), and the parse is where
        // they live. A small crafted file is enough.
        //
        // This resolves to SheetJS 0.20.3, installed from the vendor's own CDN
        // (see the `xlsx` entry in package.json) rather than the npm registry.
        // That is deliberate: the registry copy is frozen at 0.18.5 and carries
        // two unfixed high-severity advisories — prototype pollution
        // (GHSA-4r6h-8v6p-xvw6, patched 0.19.3) and ReDoS
        // (GHSA-5pgg-2g8v-p4x9, patched 0.20.2). The vendor stopped publishing
        // to npm, so no registry version will ever carry those fixes and
        // `npm audit fix` cannot reach them.
        //
        // The trade is a build-time dependency on cdn.sheetjs.com. The lockfile
        // pins the exact tarball URL and integrity hash, so a compromised CDN
        // cannot silently swap the contents, but `npm ci` does need to reach
        // that host. If it ever becomes unreachable, vendor the tarball rather
        // than falling back to the npm 0.18.5 build.
        const XLSX = await import('xlsx');
        const buf = await blob.arrayBuffer();
        const wb = XLSX.read(buf, { type: 'array' });
        if (cancelled) return;
        const summaries: SheetSummary[] = wb.SheetNames.map((name) => {
          const ws = wb.Sheets[name];
          if (!ws) {
            return { name, html: '', rowCount: 0, truncated: false };
          }
          const ref = ws['!ref'];
          let rowCount = 0;
          let truncated = false;
          if (ref) {
            const range = XLSX.utils.decode_range(ref);
            const total = range.e.r - range.s.r + 1;
            rowCount = total;
            if (total > MAX_ROWS) {
              const limited = {
                s: range.s,
                e: { r: range.s.r + MAX_ROWS - 1, c: range.e.c },
              };
              ws['!ref'] = XLSX.utils.encode_range(limited);
              truncated = true;
            }
          }
          const html = XLSX.utils.sheet_to_html(ws, { editable: false });
          return { name, html, rowCount, truncated };
        });
        setSheets(summaries);
      } catch (e) {
        if (!cancelled) {
          setConvertError(
            e instanceof Error ? e.message : 'Spreadsheet failed to load'
          );
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [blob]);

  if (loading) return <ViewerStatus state="loading" />;
  if (error) return <ViewerStatus state="error" message={error} />;
  if (convertError)
    return <ViewerStatus state="error" message={convertError} />;
  if (!sheets) return <ViewerStatus state="loading" />;
  if (!sheets.length) {
    return <ViewerStatus state="error" message="Workbook has no sheets" />;
  }

  const current = sheets[active];

  return (
    <div className="flex h-full flex-col">
      {sheets.length > 1 && (
        <div className="flex items-center gap-0.5 overflow-x-auto border-b border-[var(--panel-border)] bg-[var(--panel)] px-2 py-1">
          {sheets.map((s, i) => (
            <button
              key={s.name + i}
              type="button"
              onClick={() => setActive(i)}
              className={`shrink-0 rounded-[var(--radius-input)] px-2 py-1 text-[11px] ${
                i === active
                  ? 'bg-[var(--panel-2)] text-[var(--text)]'
                  : 'text-[var(--text-muted)] hover:text-[var(--text)]'
              }`}
            >
              {s.name || `Sheet ${i + 1}`}
            </button>
          ))}
        </div>
      )}
      <div className="xlsx-viewer flex-1 overflow-auto bg-[var(--panel)] p-3">
        <div
          className="text-xs text-[var(--text)]"
          dangerouslySetInnerHTML={{ __html: sanitizeHtml(current.html) }}
        />
        {current.truncated && (
          <div className="mt-3 border-t border-[var(--panel-border)] pt-2 text-[11px] text-[var(--text-muted)]">
            Showing first {MAX_ROWS.toLocaleString()} rows of{' '}
            {current.rowCount.toLocaleString()}. Download the file to see the
            rest.
          </div>
        )}
      </div>
    </div>
  );
}
