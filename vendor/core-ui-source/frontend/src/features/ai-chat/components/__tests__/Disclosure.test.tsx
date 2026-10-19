/**
 * B-AGENT-01 regression — reasoning is collapsed by default at rest.
 *
 * The hand-rolled `<Disclosure>` this file used to guard has been RETIRED
 * (rejected design, twice). Integral's reasoning / tool sections are now the
 * jvchat-faithful assistant-ui scaffold (`Reasoning` / `ToolGroup` /
 * `ToolFallback`), and the per-exchange reasoning section is `ReasoningChain`
 * (defined inline in `Thread.tsx`, built on the ported `Reasoning*` primitives).
 *
 * The ORIGINAL B-AGENT-01 intent — "reasoning starts collapsed at rest" — is
 * preserved by `WorkTrail`, which wraps reasoning and tool steps as one
 * disclosure:
 *   - rendered for the `group-chainOfThought` grouped part in `Thread.tsx`
 *   - stays closed while running (`useState(false)`); the label carries the
 *     live status; a manual expansion survives completion of that turn
 *
 * The previous component-mount cases (which imported the now-removed
 * `<Disclosure>` directly) are gone because their subject no longer exists. The
 * source-shape guards below assert the same intent against the new wiring.
 */
import { describe, it, expect } from 'vitest';
import threadSource from '../Thread.tsx?raw';
import reasoningSource from '../Reasoning.tsx?raw';

describe('Thread.tsx — B-AGENT-01 guard (reasoning collapsed at rest)', () => {
  it('routes the thought trail through <WorkTrail', () => {
    expect(threadSource).toContain('<WorkTrail>{renderParts(true)}</WorkTrail>');
    expect(threadSource).toContain('{renderParts(false)}');
    expect(threadSource).not.toContain('return <WorkTrail>{children}</WorkTrail>');
  });

  it('WorkTrail stays closed unless the user opens it', () => {
    const start = threadSource.indexOf("function WorkTrail");
    const body = threadSource.slice(start, start + 2200);
    expect(body).toMatch(/useState\(false\)/);
    expect(body.includes("if (running) setOpen(true)")).toBe(false);
  });

  it('WorkTrail preserves manual expansion when the turn finishes', () => {
    const start = threadSource.indexOf("function WorkTrail");
    const end = threadSource.indexOf("// Assistant message", start);
    const body = threadSource.slice(start, end);
    expect(body).not.toContain("setOpen(false)");
    expect(body).toContain("onOpenChange={setOpen}");
  });

  it('ReasoningRoot defaults to closed (defaultOpen = false)', () => {
    // The ported collapsible root keeps jvchat's `defaultOpen = false`, so an
    // uncontrolled reasoning section is closed until explicitly opened.
    expect(
      reasoningSource.match(/defaultOpen = false/),
      'ReasoningRoot does not default to closed',
    ).toBeTruthy();
  });
});
