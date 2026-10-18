/**
 * Logo — Integral brand mark + wordmark.
 *
 * Single source of truth for the brand presentation. Used in:
 *   - Sidebar (top-left in app chrome)
 *   - Auth pages (LoginPage / SignupPage / Forgot / Reset)
 *
 * The frameless split-square mark uses two equal, offset halves with
 * rounded ends that imply an integral symbol. The wordmark sits beside it at
 * 17px / weight 600 / tracking -0.02em.
 *
 * Pass `size="sm"` for compact placements (sidebar) and `size="lg"` for
 * hero placements (auth pages). The mark and wordmark scale together.
 */

import { Link } from 'react-router-dom';
import type { ReactNode } from 'react';
import { INTEGRAL_LOGO_HALF_PATH } from '../../brandLogo';
import { PRODUCT_EDITION, PRODUCT_NAME, PRODUCT_WORDMARK } from '../../brand';

type LogoSize = 'xs' | 'sm' | 'md' | 'lg';

interface LogoProps {
  /** Optional href; renders a Link when set, otherwise a plain span. */
  to?: string;
  size?: LogoSize;
  /** Render only the mark, no wordmark. */
  markOnly?: boolean;
  className?: string;
  /** When the wordmark is rendered as a custom element (e.g. an H1 on
   *  the auth page hero), pass it here to replace the default span. */
  wordmark?: ReactNode;
  ariaLabel?: string;
}

const SIZE_TOKENS: Record<
  LogoSize,
  { mark: number; word: string; gap: string }
> = {
  xs: { mark: 14, word: 'text-[12px]', gap: 'gap-1.5' },
  sm: { mark: 22, word: 'text-[15px]', gap: 'gap-2' },
  md: { mark: 28, word: 'text-[17px]', gap: 'gap-2.5' },
  lg: { mark: 40, word: 'text-[22px]', gap: 'gap-3' },
};

export function LogoMark({ size = 'sm' }: { size?: LogoSize }) {
  const t = SIZE_TOKENS[size];
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      viewBox="58 58 604 604"
      width={t.mark}
      height={t.mark}
      className="block shrink-0"
      style={{ color: 'var(--logo-mark)' }}
    >
      <path d={INTEGRAL_LOGO_HALF_PATH} transform="translate(0 -32)" fill="currentColor" />
      <path
        d={INTEGRAL_LOGO_HALF_PATH}
        transform="translate(0 32) rotate(180 360 360)"
        fill="currentColor"
      />
    </svg>
  );
}

export function Logo({
  to,
  size = 'sm',
  markOnly = false,
  className = '',
  wordmark,
  ariaLabel,
}: LogoProps) {
  const t = SIZE_TOKENS[size];
  const inner = (
    <>
      <LogoMark size={size} />
      {!markOnly &&
        (wordmark ?? (
          <span
            className={`${t.word} font-semibold tracking-[-0.02em] text-[var(--text)] truncate`}
          >
            {PRODUCT_WORDMARK}
            {PRODUCT_EDITION ? (
              <span className="font-normal text-[var(--text-muted)] whitespace-nowrap">
                <span aria-hidden="true" className="mx-2 opacity-50">|</span>
                <span className="tracking-normal">{PRODUCT_EDITION}</span>
              </span>
            ) : null}
          </span>
        ))}
    </>
  );
  const baseClasses = `inline-flex items-center ${t.gap} min-w-0 ${className}`;
  if (to) {
    return (
      <Link
        to={to}
        aria-label={ariaLabel ?? `${PRODUCT_NAME} — go to dashboard`}
        className={`${baseClasses} group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring-color)] rounded-md`}
      >
        {inner}
      </Link>
    );
  }
  return <span className={baseClasses}>{inner}</span>;
}
