import type { ComponentPropsWithoutRef, ReactNode } from 'react';
import type { Components } from 'react-markdown';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

import { IntegralMarkdownLink } from './IntegralMarkdownLink';

export interface MarkdownContentProps {
  children: string;
  className?: string;
  /** Smaller type and tighter blocks (feed cards, meta rows, widgets). */
  compact?: boolean;
  /**
   * When true (default), body copy uses `--text-muted`. Set false for surfaces that should
   * read as primary text (e.g. comment bubbles).
   */
  mutedBody?: boolean;
}

function buildComponents(compact: boolean, mutedBody: boolean): Components {
  const bodyFg = mutedBody ? 'text-[var(--text-muted)]' : 'text-[var(--text)]';
  const pClass = compact
    ? `mb-1.5 last:mb-0 text-[0.8125rem] leading-relaxed ${bodyFg}`
    : `mb-2 last:mb-0 text-sm leading-relaxed ${bodyFg}`;
  const liSize = compact ? 'text-[0.8125rem]' : 'text-sm';

  const h = compact
    ? [
        'text-base font-semibold',
        'text-[0.9375rem] font-semibold',
        'text-sm font-semibold',
        'text-sm font-medium',
        'text-sm font-medium',
        'text-xs font-semibold uppercase tracking-wide',
      ]
    : [
        'text-lg font-semibold',
        'text-base font-semibold',
        'text-sm font-semibold',
        'text-sm font-medium',
        'text-sm font-medium',
        'text-xs font-semibold uppercase tracking-wide',
      ];

  const heading =
    (Tag: 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6', i: number) =>
    ({ children, ...props }: ComponentPropsWithoutRef<typeof Tag>) =>
      (
        <Tag
          className={`${h[i]} text-[var(--text)] mb-1.5 mt-3 first:mt-0 last:mb-0`}
          {...props}
        >
          {children}
        </Tag>
      );

  return {
    h1: heading('h1', 0),
    h2: heading('h2', 1),
    h3: heading('h3', 2),
    h4: heading('h4', 3),
    h5: heading('h5', 4),
    h6: heading('h6', 5),
    p: ({ children, ...props }) => (
      <p className={pClass} {...props}>
        {children as ReactNode}
      </p>
    ),
    a: ({ children, href, ...props }) => (
      <IntegralMarkdownLink href={href} {...props}>
        {children as ReactNode}
      </IntegralMarkdownLink>
    ),
    ul: ({ children, ...props }) => (
      <ul
        className={`list-disc pl-4 my-1.5 space-y-0.5 ${bodyFg} ${liSize}`}
        {...props}
      >
        {children as ReactNode}
      </ul>
    ),
    ol: ({ children, ...props }) => (
      <ol
        className={`list-decimal pl-4 my-1.5 space-y-0.5 ${bodyFg} ${liSize}`}
        {...props}
      >
        {children as ReactNode}
      </ol>
    ),
    li: ({ children, ...props }) => (
      <li className="leading-relaxed [&>p]:mb-0 [&>p]:inline" {...props}>
        {children as ReactNode}
      </li>
    ),
    blockquote: ({ children, ...props }) => (
      <blockquote
        className={`border-l-2 border-[var(--panel-border)] pl-3 my-2 italic ${bodyFg}`}
        {...props}
      >
        {children as ReactNode}
      </blockquote>
    ),
    hr: ({ ...props }) => <hr className="my-3 border-[var(--panel-border)]" {...props} />,
    strong: ({ children, ...props }) => (
      <strong className="font-semibold text-[var(--text)]" {...props}>
        {children as ReactNode}
      </strong>
    ),
    em: ({ children, ...props }) => <em className="italic" {...props}>{children as ReactNode}</em>,
    code: ({ className, children, ...props }) => {
      const isFenced = Boolean(className && className.includes('language-'));
      const isPlainText = className?.split(/\s+/).includes('language-text');
      const raw = String(children).replace(/\n$/, '');
      const isMultilineBlock = !isFenced && raw.includes('\n');
      if (isFenced || isMultilineBlock) {
        return (
          <code
            className={`${className || ''} block w-full bg-transparent p-0 text-[var(--text)] text-xs font-mono ${isPlainText ? 'whitespace-pre-wrap break-words' : 'whitespace-pre'}`}
            {...props}
          >
            {children as ReactNode}
          </code>
        );
      }
      return (
        <code
          className="rounded bg-[var(--panel-2)] px-1 py-0.5 text-[0.85em] font-mono text-[var(--text)]"
          {...props}
        >
          {children as ReactNode}
        </code>
      );
    },
    pre: ({ children, ...props }) => (
      <pre
        className="overflow-x-auto rounded-md border border-[var(--panel-border)] bg-[var(--panel-2)] p-2 my-2 text-xs font-mono text-[var(--text)] [&_code]:rounded-none [&_code]:bg-transparent [&_code]:p-0"
        {...props}
      >
        {children as ReactNode}
      </pre>
    ),
    table: ({ children, ...props }) => (
      <div className="overflow-x-auto my-2">
        <table
          className="min-w-full border-collapse border border-[var(--panel-border)] text-sm"
          {...props}
        >
          {children as ReactNode}
        </table>
      </div>
    ),
    thead: ({ children, ...props }) => (
      <thead className="bg-[var(--panel-2)]" {...props}>
        {children as ReactNode}
      </thead>
    ),
    th: ({ children, ...props }) => (
      <th
        className="border border-[var(--panel-border)] px-2 py-1 text-left font-medium text-[var(--text)]"
        {...props}
      >
        {children as ReactNode}
      </th>
    ),
    td: ({ children, ...props }) => (
      <td className={`border border-[var(--panel-border)] px-2 py-1 ${bodyFg}`} {...props}>
        {children as ReactNode}
      </td>
    ),
    img: ({ src, alt, ...props }) => (
      <img
        src={src}
        alt={alt ?? ''}
        className="max-h-48 max-w-full rounded-md border border-[var(--panel-border)] my-2 object-contain"
        loading="lazy"
        {...props}
      />
    ),
  };
}

/**
 * Renders markdown using GFM; links open externally. No raw HTML (passed through as text).
 */
export function MarkdownContent({
  children,
  className = '',
  compact = false,
  mutedBody = true,
}: MarkdownContentProps) {
  const source = children ?? '';
  if (!source.trim()) return null;

  return (
    <div className={`markdown-content min-w-0 [overflow-wrap:anywhere] ${className}`.trim()}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        skipHtml
        components={buildComponents(compact, mutedBody)}
      >
        {source}
      </ReactMarkdown>
    </div>
  );
}
