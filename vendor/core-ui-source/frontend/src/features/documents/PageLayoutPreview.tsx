import { useMemo } from 'react';
import {
  PAGE_SIZE_INCHES,
  PX_PER_INCH,
  type MarginsInches,
  type PageSizeKey,
} from './documentTheme';
import { sanitizeLetterheadHtml } from '../../utils/sanitizeLetterheadHtml';

interface Props {
  pageSize: PageSizeKey;
  margins: MarginsInches;
  headerHtml: string;
  footerHtml: string;
  pageNumbers: boolean;
  className?: string;
}

const PREVIEW_SCALE = 0.42;

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function zoneHasContent(html: string): boolean {
  if (!html.trim()) return false;
  if (/<img\b/i.test(html)) return true;
  return stripHtml(html).length > 0;
}

export function PageLayoutPreview({
  pageSize,
  margins,
  headerHtml,
  footerHtml,
  pageNumbers,
  className = '',
}: Props) {
  const [wIn, hIn] = PAGE_SIZE_INCHES[pageSize];
  const widthPx = Math.round(wIn * PX_PER_INCH * PREVIEW_SCALE);
  const heightPx = Math.round(hIn * PX_PER_INCH * PREVIEW_SCALE);

  const padding = useMemo(
    () => ({
      top: Math.round(margins.top * PX_PER_INCH * PREVIEW_SCALE),
      right: Math.round(margins.right * PX_PER_INCH * PREVIEW_SCALE),
      bottom: Math.round(margins.bottom * PX_PER_INCH * PREVIEW_SCALE),
      left: Math.round(margins.left * PX_PER_INCH * PREVIEW_SCALE),
    }),
    [margins],
  );

  const headerFilled = zoneHasContent(headerHtml);
  const footerFilled = zoneHasContent(footerHtml);

  return (
    <div
      className={`page-layout-preview ${className}`.trim()}
      aria-hidden="true"
    >
      <div
        className="page-layout-preview__sheet"
        style={{ width: widthPx, minHeight: heightPx }}
      >
        <div
          className="page-layout-preview__inner"
          style={{
            paddingTop: padding.top,
            paddingRight: padding.right,
            paddingBottom: padding.bottom,
            paddingLeft: padding.left,
          }}
        >
          <div
            className={`page-layout-preview__zone page-layout-preview__zone--header${
              headerFilled ? ' page-layout-preview__zone--filled' : ''
            }`}
          >
            {headerFilled ? (
              <div
                className="page-layout-preview__rich"
                dangerouslySetInnerHTML={{
                  __html: sanitizeLetterheadHtml(headerHtml),
                }}
              />
            ) : (
              <span className="page-layout-preview__placeholder">Top of page</span>
            )}
          </div>
          <div className="page-layout-preview__body">
            <span className="page-layout-preview__line" />
            <span className="page-layout-preview__line page-layout-preview__line--short" />
            <span className="page-layout-preview__line" />
          </div>
          <div
            className={`page-layout-preview__zone page-layout-preview__zone--footer${
              footerFilled || pageNumbers ? ' page-layout-preview__zone--filled' : ''
            }`}
          >
            {footerFilled ? (
              <div
                className="page-layout-preview__rich"
                dangerouslySetInnerHTML={{
                  __html: sanitizeLetterheadHtml(footerHtml),
                }}
              />
            ) : pageNumbers ? (
              <span className="page-layout-preview__page-num">Page 1</span>
            ) : (
              <span className="page-layout-preview__placeholder">Bottom of page</span>
            )}
          </div>
        </div>
      </div>
      <p className="page-layout-preview__caption">Live preview</p>
    </div>
  );
}
