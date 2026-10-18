import { useState } from 'react';
import { Button } from '../../components/ui';
import type { DashboardWidgetTypeSpec } from '../../api/dashboards';
import {
  assignWidgetIds,
  STARTER_TEMPLATES,
} from './starterWidgets';
import { Text } from '../../ui';

export interface CreateDashboardFormProps {
  widgetTypes: DashboardWidgetTypeSpec[];
  onCreateBlank: (name: string) => void;
  onCreateFromTemplate: (
    name: string,
    widgets: ReturnType<typeof assignWidgetIds>,
  ) => void;
  onSuggest: () => void;
  suggesting?: boolean;
  creating?: boolean;
}

export function CreateDashboardForm({
  onCreateBlank,
  onCreateFromTemplate,
  onSuggest,
  suggesting = false,
  creating = false,
}: CreateDashboardFormProps) {
  const [name, setName] = useState('');
  const [templateKey, setTemplateKey] = useState<string>('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    if (templateKey) {
      const tpl = STARTER_TEMPLATES.find(t => t.key === templateKey);
      if (tpl) {
        onCreateFromTemplate(trimmed, assignWidgetIds(tpl.widgets));
        return;
      }
    }
    onCreateBlank(trimmed);
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-[var(--radius-card)] border border-[var(--border-subtle)] bg-[var(--bg-subtle)] p-4"
    >
      <Text variant="body" as="p" className="mb-3 font-medium">
        Create dashboard
      </Text>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <label className="flex min-w-0 flex-1 flex-col gap-1 text-sm">
          <span className="text-[var(--text-muted)]">Name</span>
          <input
            className="rounded-[var(--radius-input)] border border-[var(--border-subtle)] bg-[var(--bg)] px-3 py-2"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="Sales overview"
          />
        </label>
        <label className="flex min-w-0 flex-1 flex-col gap-1 text-sm">
          <span className="text-[var(--text-muted)]">Template (optional)</span>
          <select
            className="rounded-[var(--radius-input)] border border-[var(--border-subtle)] bg-[var(--bg)] px-3 py-2"
            value={templateKey}
            onChange={e => setTemplateKey(e.target.value)}
          >
            <option value="">Blank</option>
            {STARTER_TEMPLATES.map(t => (
              <option key={t.key} value={t.key}>
                {t.label}
              </option>
            ))}
          </select>
        </label>
        <Button type="submit" size="sm" disabled={creating || !name.trim()}>
          Create
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={suggesting}
          onClick={onSuggest}
        >
          {suggesting ? 'Suggesting…' : 'Suggest for this App'}
        </Button>
      </div>
    </form>
  );
}
