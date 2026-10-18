import { useEffect, useState } from 'react';
import { entriesApi } from '../../api';
import { Surface, Text } from '../../ui';
import type { ViewWidgetProps } from './types';
import type { Entry } from '../../types';

/**
 * Reference UI pack widget (``example-desk/desk-summary``,
 * docs/operational-models/UI_PACKS.md) — a minimal entry-scoped, read-only
 * single-value tile bound to the current entry, same self-fetch pattern as
 * ``SummaryTilesWidget``. Deliberately small: this is a worked example of
 * the UI Packs Standard end to end, not a feature-complete widget. Config:
 * ``{field: <field key>, label?}``.
 */
export function ExampleDeskSummaryWidget({ view, isLoading }: ViewWidgetProps) {
  const config = (view.config || {}) as Record<string, unknown>;
  const rawBindings = (config.__bindings || {}) as Record<string, unknown>;
  const hostEntryId =
    typeof rawBindings.entryId === 'string' ? rawBindings.entryId : undefined;
  const field = typeof config.field === 'string' ? config.field : undefined;
  const label = typeof config.label === 'string' ? config.label : field;

  const [entry, setEntry] = useState<Entry | null>(null);
  const [loadingEntry, setLoadingEntry] = useState(true);

  useEffect(() => {
    let cancelled = false;
    if (!hostEntryId) {
      setEntry(null);
      setLoadingEntry(false);
      return;
    }
    setLoadingEntry(true);
    entriesApi
      .get(hostEntryId)
      .then(fetched => {
        if (!cancelled) setEntry(fetched);
      })
      .catch(() => {
        if (!cancelled) setEntry(null);
      })
      .finally(() => {
        if (!cancelled) setLoadingEntry(false);
      });
    return () => {
      cancelled = true;
    };
  }, [hostEntryId]);

  if (isLoading || loadingEntry) {
    return <Surface tone="panel-2" radius="input" className="h-12 animate-pulse">{null}</Surface>;
  }

  if (!entry || !field) {
    return null;
  }

  const value = entry.custom_fields?.[field];

  return (
    <Surface
      tone="panel-2"
      border="default"
      radius="input"
      padding="md"
      data-testid="example-desk-summary"
    >
      <Text as="div" variant="label" tone="muted" className="uppercase tracking-wide">
        {label}
      </Text>
      <Text as="div" variant="heading-sm">
        {value === undefined || value === null || value === '' ? '—' : String(value)}
      </Text>
    </Surface>
  );
}
