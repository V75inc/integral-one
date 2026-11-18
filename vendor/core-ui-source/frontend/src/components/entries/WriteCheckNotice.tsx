import { AlertTriangle } from 'lucide-react';
import { Text } from '../../ui';

/** Split "Lead sentence. A: x; B: y (and 3 more)" into the lead and the listed items; plain text has no items. */
export function splitCheckMessage(message: string): { lead: string; items: string[]; more: string } {
  const text = message.trim();
  if (!text.includes('; ') && !/\(and \d+ more\)\s*$/.test(text)) return { lead: text, items: [], more: '' };
  const moreMatch = text.match(/\s*\((and \d+ more)\)\s*$/);
  const more = moreMatch ? moreMatch[1] : '';
  const body = moreMatch ? text.slice(0, moreMatch.index) : text;
  const parts = body.split('; ');
  const first = parts[0];
  const cut = first.lastIndexOf('. ');
  if (cut < 0) return { lead: text, items: [], more: '' };
  const lead = first.slice(0, cut + 1);
  const items = [first.slice(cut + 2), ...parts.slice(1)].map(s => s.replace(/\.$/, '').trim()).filter(Boolean);
  return { lead, items, more };
}

/**
 * The server's reason a create or save cannot go ahead, shown inside the form where the person is looking
 * (not in the button row). A message that lists items (people with missing details) shows them as a list.
 */
export function WriteCheckNotice({ message }: { message: string }) {
  const { lead, items, more } = splitCheckMessage(message);
  return (
    <div
      role="alert"
      className="flex gap-3 rounded-[var(--radius-card)] border border-[var(--danger-border,var(--danger-text))] bg-[var(--danger-bg,var(--panel-2))] p-3"
    >
      <AlertTriangle size={18} className="mt-0.5 shrink-0 text-[var(--danger-text)]" aria-hidden />
      <div className="min-w-0 flex-1 space-y-2">
        <Text as="p" variant="body-sm" tone="danger" weight="medium">
          {lead}
        </Text>
        {items.length ? (
          <ul className="max-h-48 space-y-1 overflow-y-auto pr-1">
            {items.map(item => (
              <li key={item}>
                <Text as="span" variant="body-sm">
                  {item}
                </Text>
              </li>
            ))}
            {more ? (
              <li>
                <Text as="span" variant="body-sm" tone="muted">
                  …{more}
                </Text>
              </li>
            ) : null}
          </ul>
        ) : null}
      </div>
    </div>
  );
}
