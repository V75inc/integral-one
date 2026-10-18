// Smooth-streaming markdown renderer for assistant answer + reasoning text.
//
// Wraps assistant-ui's `MarkdownTextPrimitive` (from
// `@assistant-ui/react-markdown`), which reads the live message part from
// context and — with `smooth` — character-interpolates the streamed text and
// paints the trailing streaming dot (`@assistant-ui/react-markdown/styles/dot.css`).
// This is the jvchat mechanism, re-skinned in Integral CSS tokens so streamed
// text looks identical to the non-streamed `MarkdownContent` renderer used
// everywhere else in the app.
//
// Prop-less by design: the primitive pulls the active part from the
// surrounding `MessagePrimitive.GroupedParts` render context, so this is a
// `memo`'d leaf with no inputs (matches jvchat's `markdown-text.tsx`).
import "@assistant-ui/react-markdown/styles/dot.css";

import { useAuiState } from "@assistant-ui/react";

import {
  MarkdownTextPrimitive,
  unstable_memoizeMarkdownComponents as memoizeMarkdownComponents,
  useIsMarkdownCodeBlock,
} from "@assistant-ui/react-markdown";
import remarkGfm from "remark-gfm";
import remarkBreaks from "remark-breaks";
import { memo } from "react";
import { IntegralMarkdownLink } from "../../../components/ui/IntegralMarkdownLink";

const MarkdownTextImpl = () => {
  const running = useAuiState((s) => s.message.status?.type === "running");
  return (
    <MarkdownTextPrimitive
      // Rebuild the settled markdown tree from the authoritative part. Fenced
      // blocks can retain a memoized animation prefix after live output ends.
      key={running ? "live" : "settled"}
      // A settled response may arrive as one authoritative replacement.
      // Smooth only live output; an inactive/background tab must not retain
      // an interpolation prefix after the model and transport have finished.
      smooth={running}
      remarkPlugins={[remarkGfm, remarkBreaks]}
      className="aui-md min-w-0 [overflow-wrap:anywhere]"
      components={defaultComponents}
    />
  );
};

export const MarkdownText = memo(MarkdownTextImpl);

// Element styling mirrors `components/ui/MarkdownContent.tsx` (non-compact,
// mutedBody=false body copy) so a streamed answer and a persisted one render
// the same. All colors resolve to Integral CSS variables — do NOT pull in
// `@assistant-ui/styles` (shadcn tokens Integral does not define).
const defaultComponents = memoizeMarkdownComponents({
  h1: ({ ...props }) => (
    <h1
      className="text-lg font-semibold text-[var(--text)] mb-1.5 mt-3 first:mt-0 last:mb-0"
      {...props}
    />
  ),
  h2: ({ ...props }) => (
    <h2
      className="text-base font-semibold text-[var(--text)] mb-1.5 mt-3 first:mt-0 last:mb-0"
      {...props}
    />
  ),
  h3: ({ ...props }) => (
    <h3
      className="text-sm font-semibold text-[var(--text)] mb-1.5 mt-3 first:mt-0 last:mb-0"
      {...props}
    />
  ),
  h4: ({ ...props }) => (
    <h4
      className="text-sm font-medium text-[var(--text)] mb-1.5 mt-3 first:mt-0 last:mb-0"
      {...props}
    />
  ),
  h5: ({ ...props }) => (
    <h5
      className="text-sm font-medium text-[var(--text)] mb-1.5 mt-3 first:mt-0 last:mb-0"
      {...props}
    />
  ),
  h6: ({ ...props }) => (
    <h6
      className="text-xs font-semibold uppercase tracking-wide text-[var(--text)] mb-1.5 mt-3 first:mt-0 last:mb-0"
      {...props}
    />
  ),
  p: ({ ...props }) => (
    <p
      className="mb-2 last:mb-0 text-sm leading-relaxed text-[var(--text)]"
      {...props}
    />
  ),
  a: ({ children, href, ...props }) => (
    <IntegralMarkdownLink href={href} {...props}>
      {children}
    </IntegralMarkdownLink>
  ),
  ul: ({ ...props }) => (
    <ul
      className="list-disc pl-4 my-1.5 space-y-0.5 text-[var(--text)] text-sm"
      {...props}
    />
  ),
  ol: ({ ...props }) => (
    <ol
      className="list-decimal pl-4 my-1.5 space-y-0.5 text-[var(--text)] text-sm"
      {...props}
    />
  ),
  li: ({ ...props }) => (
    <li
      className="leading-relaxed [&>p]:mb-0 [&>p]:inline"
      {...props}
    />
  ),
  blockquote: ({ ...props }) => (
    <blockquote
      className="border-l-2 border-[var(--panel-border)] pl-3 my-2 italic text-[var(--text)]"
      {...props}
    />
  ),
  hr: ({ ...props }) => (
    <hr className="my-3 border-[var(--panel-border)]" {...props} />
  ),
  strong: ({ ...props }) => (
    <strong className="font-semibold text-[var(--text)]" {...props} />
  ),
  em: ({ ...props }) => <em className="italic" {...props} />,
  pre: ({ ...props }) => (
    <pre
      className="overflow-x-auto rounded-md border border-[var(--panel-border)] bg-[var(--panel-2)] p-2 my-2 text-xs font-mono text-[var(--text)] [&_code]:rounded-none [&_code]:bg-transparent [&_code]:p-0"
      {...props}
    />
  ),
  code: function Code({ className, ...props }) {
    const isCodeBlock = useIsMarkdownCodeBlock();
    if (isCodeBlock) {
      return (
        <code
          className={`${className ?? ""} block w-full bg-transparent p-0 text-[var(--text)] text-xs font-mono whitespace-pre`}
          {...props}
        />
      );
    }
    return (
      <code
        className="rounded bg-[var(--panel-2)] px-1 py-0.5 text-[0.85em] font-mono text-[var(--text)]"
        {...props}
      />
    );
  },
  table: ({ ...props }) => (
    <div className="overflow-x-auto my-2">
      <table
        className="min-w-full border-collapse border border-[var(--panel-border)] text-sm"
        {...props}
      />
    </div>
  ),
  thead: ({ ...props }) => (
    <thead className="bg-[var(--panel-2)]" {...props} />
  ),
  th: ({ ...props }) => (
    <th
      className="border border-[var(--panel-border)] px-2 py-1 text-left font-medium text-[var(--text)]"
      {...props}
    />
  ),
  td: ({ ...props }) => (
    <td
      className="border border-[var(--panel-border)] px-2 py-1 text-[var(--text)]"
      {...props}
    />
  ),
  img: ({ alt, ...props }) => (
    <img
      alt={alt ?? ""}
      className="max-h-48 max-w-full rounded-md border border-[var(--panel-border)] my-2 object-contain"
      loading="lazy"
      {...props}
    />
  ),
});
