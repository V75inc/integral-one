import type { CSSProperties, ReactNode } from 'react';

export interface AvatarStackedMetaProps {
  avatar: ReactNode;
  primary: ReactNode;
  secondary?: ReactNode;
  /** Column 2, below secondary (e.g. UserByline children). */
  afterMeta?: ReactNode;
  /** Column 2, with top margin (e.g. comment bubble). */
  body?: ReactNode;
  /** Column 2, below body (e.g. Reply / actions). */
  footer?: ReactNode;
  className?: string;
}

const col2: CSSProperties = { gridColumnStart: 2 };

/**
 * Avatar vertically centered with two header lines (primary + secondary).
 * Optional blocks stack in column 2 below the header; avatar only spans the header rows.
 *
 * Uses explicit grid placement so rows 3+ (body/footer) never confuse auto-placement
 * with the avatar cell (fixes nested comment threads and narrow widths).
 */
export function AvatarStackedMeta({
  avatar,
  primary,
  secondary,
  afterMeta,
  body,
  footer,
  className = '',
}: AvatarStackedMetaProps) {
  const hasSecondRow = secondary != null;
  const hasBelow = afterMeta != null || body != null || footer != null;

  if (!hasSecondRow && !hasBelow) {
    return (
      <div className={`flex min-w-0 items-center gap-2.5 ${className}`}>
        <div className="shrink-0">{avatar}</div>
        <div className="min-w-0 flex-1">{primary}</div>
      </div>
    );
  }

  let nextRow = hasSecondRow ? 3 : 2;
  let afterRow: number | undefined;
  let bodyRow: number | undefined;
  let footerRow: number | undefined;
  if (afterMeta != null) {
    afterRow = nextRow;
    nextRow += 1;
  }
  if (body != null) {
    bodyRow = nextRow;
    nextRow += 1;
  }
  if (footer != null) {
    footerRow = nextRow;
  }

  const avatarCellStyle: CSSProperties = hasSecondRow
    ? {
        gridColumnStart: 1,
        gridRowStart: 1,
        gridRowEnd: 3,
        alignSelf: 'stretch',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'flex-start',
        minWidth: 0,
      }
    : {
        gridColumnStart: 1,
        gridRowStart: 1,
        alignSelf: 'center',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'flex-start',
        minWidth: 0,
      };

  return (
    <div
      className={`grid w-full min-w-0 grid-cols-[auto_minmax(0,1fr)] gap-x-2.5 gap-y-0.5 ${className}`}
    >
      <div className="shrink-0" style={avatarCellStyle}>
        {avatar}
      </div>
      <div className="min-w-0" style={{ ...col2, gridRowStart: 1 }}>
        {primary}
      </div>
      {hasSecondRow ? (
        <div className="min-w-0" style={{ ...col2, gridRowStart: 2 }}>
          {secondary}
        </div>
      ) : null}
      {afterMeta != null && afterRow != null ? (
        <div
          className="min-w-0 mt-0.5"
          style={{ ...col2, gridRowStart: afterRow }}
        >
          {afterMeta}
        </div>
      ) : null}
      {body != null && bodyRow != null ? (
        <div className="min-w-0 mt-1" style={{ ...col2, gridRowStart: bodyRow }}>
          {body}
        </div>
      ) : null}
      {footer != null && footerRow != null ? (
        <div
          className="min-w-0 mt-1 pl-1"
          style={{ ...col2, gridRowStart: footerRow }}
        >
          {footer}
        </div>
      ) : null}
    </div>
  );
}
