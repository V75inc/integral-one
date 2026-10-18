import { Surface, Text } from '../../ui';
import type { ViewWidgetProps } from './types';
import type { Entry } from '../../types';
import './example-desk.css';

/**
 * Reference UI pack widget (``example-desk/desk-board``,
 * docs/operational-models/UI_PACKS.md) — a minimal track-scoped card grid
 * grouped by a select field. Deliberately small: this is a worked example
 * of the UI Packs Standard end to end, not a feature-complete widget.
 * Config: ``{group_by: <field key>, title?}``.
 */
export function ExampleDeskBoardWidget({ entries, view, isLoading }: ViewWidgetProps) {
  const config = (view.config || {}) as Record<string, unknown>;
  const groupBy = typeof config.group_by === 'string' ? config.group_by : undefined;
  const title = typeof config.title === 'string' ? config.title : undefined;

  if (isLoading) {
    return <Surface tone="panel-2" radius="input" className="h-16 animate-pulse">{null}</Surface>;
  }

  const groups = new Map<string, Entry[]>();
  for (const entry of entries) {
    const raw = groupBy ? entry.custom_fields?.[groupBy] : undefined;
    const key = raw === undefined || raw === null || raw === '' ? 'Ungrouped' : String(raw);
    const bucket = groups.get(key);
    if (bucket) {
      bucket.push(entry);
    } else {
      groups.set(key, [entry]);
    }
  }

  return (
    <div className="example-desk-board" data-testid="example-desk-board">
      {title && <Text as="h3" variant="heading-sm">{title}</Text>}
      {Array.from(groups.entries()).map(([group, groupEntries]) => (
        <div key={group} className="example-desk-board__group">
          <Text as="div" variant="label" tone="muted" className="example-desk-board__group-label">
            {group}
          </Text>
          <div className="example-desk-board__cards">
            {groupEntries.map(entry => (
              <Surface key={entry.id} tone="panel" border="default" radius="card" padding="md">
                <Text as="div" variant="body-sm">{entry.title}</Text>
              </Surface>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
