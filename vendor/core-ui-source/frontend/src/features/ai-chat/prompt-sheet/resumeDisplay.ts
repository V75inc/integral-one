/** Detect / parse Prompt Sheet resume turns in the transcript. */

export const PROMPT_SHEET_RESUME_MARKER = '[PROMPT_SHEET]';

export function isPromptSheetResume(text: string): boolean {
  return text.trimStart().startsWith(PROMPT_SHEET_RESUME_MARKER);
}

export interface PromptSheetResumeView {
  title: string;
  items: string[];
  footer: string | null;
}

/** Structured view for the quiet system note (marker stripped). */
export function parsePromptSheetResume(text: string): PromptSheetResumeView {
  const trimmed = text.trimStart();
  const body = trimmed.startsWith(PROMPT_SHEET_RESUME_MARKER)
    ? trimmed.slice(PROMPT_SHEET_RESUME_MARKER.length).replace(/^\n+/, '').trim()
    : text.trim();

  // Host-only continuation used to live in the resume blob (HTML comment or
  // unbounded lead-in). New turns inject it via wrap_system_context at send
  // time; keep stripping so older transcripts stay quiet in the UI.
  const displayBody = body
    .replace(/<!--\s*INTEGRAL_AGENT_DIRECTIVE[\s\S]*?-->/g, '')
    .replace(/<!--\s*BEGIN_HOST_SYSTEM_CONTEXT[\s\S]*?END_HOST_SYSTEM_CONTEXT[^>]*-->/gi, '')
    .replace(
      /\n*The approved writes above have already been applied\.[\s\S]*$/i,
      '',
    )
    .replace(/\n*Please continue\.?\s*$/i, '');

  const lines = displayBody
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);

  if (lines.length === 0) {
    return { title: body, items: [], footer: null };
  }

  const items: string[] = [];
  const footer: string | null = null;
  let title = lines[0];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (/^•\s+/.test(line) || /^[-*]\s+/.test(line)) {
      items.push(line.replace(/^([•\-*]\s+)/, ''));
      continue;
    }
    if (/^please continue\.?$/i.test(line)) {
      // Legacy footer — no longer rendered; continuation is host-side.
      continue;
    }
    // Legacy single-paragraph format — split on "; " if present.
    if (i === 1 && items.length === 0 && /;\s+/.test(line)) {
      const parts = line.split(/;\s+/).map((p) => p.replace(/\.$/, '').trim());
      items.push(...parts.filter(Boolean));
      continue;
    }
    items.push(line);
  }

  // Legacy: "Resolved prompts: a; b. Please continue." on one/two lines.
  if (items.length === 0 && /:\s+/.test(title)) {
    const [head, rest] = title.split(/:\s+/, 2);
    title = head.trim();
    const chunk = (rest || '').replace(/\s*Please continue\.?$/i, '').trim();
    if (chunk) {
      items.push(
        ...chunk
          .split(/;\s+/)
          .map((p) => p.replace(/\.$/, '').trim())
          .filter(Boolean),
      );
    }
  }

  // Soften robotic legacy titles still hanging in older transcripts.
  title = humanizeLegacyResumeTitle(title);
  const softenedItems = items.map(humanizeLegacyResumeBullet);

  return { title, items: softenedItems, footer };
}

const LEGACY_TITLES: Record<string, string> = {
  'prompt resolved': 'Updates applied',
  'resolved prompts': 'You confirmed a few changes',
  'cancelled remaining prompts': 'Remaining prompts dismissed',
};

function humanizeLegacyResumeTitle(title: string): string {
  const mapped = LEGACY_TITLES[title.trim().toLowerCase()];
  return mapped ?? title;
}

function humanizeLegacyResumeBullet(item: string): string {
  return item
    .replace(/^Approved design\s*[—–-]\s*/i, '')
    .replace(/^Approved\s*[—–-]\s*/i, '')
    .replace(/^Rejected\s*[—–-]\s*/i, "Didn't apply — ")
    .replace(/^Expired without applying\s*[—–-]\s*/i, '')
    .replace(/^Approval record unavailable\s*[—–-]\s*/i, '')
    .replace(/^Chose\s+/i, '')
    .replace(/^Cancelled\s*[—–-]\s*/i, 'Dismissed — ')
    .replace(/^Skipped\s*[—–-]\s*/i, 'Skipped: ');
}

/** @deprecated prefer parsePromptSheetResume for list rendering */
export function promptSheetResumeDisplay(text: string): string {
  const view = parsePromptSheetResume(text);
  const parts = [view.title, ...view.items.map((i) => `• ${i}`)];
  if (view.footer) parts.push(view.footer);
  return parts.join('\n');
}
