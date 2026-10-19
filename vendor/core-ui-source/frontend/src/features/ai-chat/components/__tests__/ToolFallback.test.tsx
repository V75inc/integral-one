/**
 * Tool-call result/args rendering — the value must be pretty-printed JSON, not
 * a single-line blob. Regression for the native provider case where a tool result
 * arrives as a JSON-ENCODED STRING (Python `json.dumps`, `": "` / `", "`
 * separators) — rendered verbatim it's an unindented one-liner; ToolFallback
 * must parse-then-pretty it via `formatToolValue`.
 *
 * Targets the leaf `ToolFallbackResult` / `ToolFallbackArgs` (plain <pre>, no
 * Radix Collapsible) so the assertion is on the formatted text itself, not on
 * collapsible mount state.
 */
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { ToolFallbackArgs, ToolFallbackResult } from "../ToolFallback";

const PRETTY = [
  "{",
  '  "scope": "user",',
  '  "scope_id": null,',
  '  "workspace_id": "n.Workspace.dc7"',
  "}",
].join("\n");

describe("ToolFallback result/args formatting", () => {
  it("pretty-prints a JSON-ENCODED-STRING result (the native provider case)", () => {
    const raw =
      '{"scope": "user", "scope_id": null, "workspace_id": "n.Workspace.dc7"}';
    const { container } = render(<ToolFallbackResult result={raw} />);
    const pre = container.querySelector(".aui-tool-fallback-result-content");
    expect(pre).not.toBeNull();
    expect(pre!.textContent).toBe(PRETTY);
    // NOT the single-line json.dumps form.
    expect(pre!.textContent).not.toContain('", "');
    // Monospace so indentation aligns.
    expect(pre!.className).toContain("font-mono");
  });

  it("pretty-prints an OBJECT result", () => {
    const { container } = render(
      <ToolFallbackResult result={{ a: 1, b: [2, 3] }} />,
    );
    const pre = container.querySelector(".aui-tool-fallback-result-content");
    expect(pre!.textContent).toBe('{\n  "a": 1,\n  "b": [\n    2,\n    3\n  ]\n}');
  });

  it("pretty-prints a JSON-encoded args string", () => {
    const { container } = render(
      <ToolFallbackArgs argsText='{"period": "week"}' />,
    );
    const pre = container.querySelector(".aui-tool-fallback-args-value");
    expect(pre!.textContent).toBe('{\n  "period": "week"\n}');
    expect(pre!.className).toContain("font-mono");
  });

  it("passes a non-JSON result string through unchanged", () => {
    const { container } = render(<ToolFallbackResult result="plain text" />);
    const pre = container.querySelector(".aui-tool-fallback-result-content");
    expect(pre!.textContent).toBe("plain text");
  });
});
