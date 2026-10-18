/** Read-only HTML preview (scripts disabled via iframe sandbox). */
export function HtmlSandboxPreview({
  html,
  className = '',
}: {
  html: string;
  className?: string;
}) {
  const srcDoc = html.trim() || '<p style="font-family:system-ui;color:#666">(empty)</p>';
  return (
    <div
      className={`overflow-hidden rounded-xl border border-[var(--border-subtle)] bg-white ${className}`.trim()}
    >
      <iframe
        title="HTML preview"
        sandbox=""
        srcDoc={srcDoc}
        className="h-[min(480px,55vh)] w-full border-0 bg-white"
      />
    </div>
  );
}
