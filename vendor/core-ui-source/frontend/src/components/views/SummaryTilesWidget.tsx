import { useEffect, useState } from 'react';
import * as Icons from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

import { entriesApi } from '../../api';
import { Surface, Text } from '../../ui';
import type { ViewWidgetProps } from './types';
import type { Entry } from '../../types';

/**
 * Read-only KPI strip — the reusable Oracle-APEX-style "Value"/KPI region.
 * Config: ``{tiles: [{label, field, format?, icon?, trend?}]}``. Reads
 * values off the bound entry (``bindings.entryId``, fetched directly —
 * same self-fetch pattern as ``FormRegionWidget``'s default 'self' bind
 * mode), formats, and renders as a horizontal strip of labeled tiles —
 * matches the original `internal-tools` webapp's PAYE summary bar
 * (Entries / Total Income / Total Deductions / Total Tax).
 *
 * ``icon``: a lucide-react icon name (PascalCase, e.g. ``"TrendingUp"``) —
 * looked up dynamically against the full icon set, same "name string from
 * config, resolved at render time" shape ``layout_container``'s icons
 * would use if it had any. An unrecognized name renders no icon rather
 * than erroring, since a config-time typo shouldn't break the whole tile.
 *
 * ``trend``: ``{field, format?, direction?}`` — a SECOND field on the same
 * bound entry read as a delta (e.g. a ``score_delta`` field alongside
 * ``score``), not a computed comparison against historical data (this
 * widget only ever fetches the one bound entry — no time-series access).
 * ``direction`` picks the up/down arrow + green/red tone explicitly
 * (``'up'``/``'down'``); omit it to infer from the value's own sign.
 */
interface TrendSpec {
  field: string;
  format?: 'number' | 'currency' | 'count';
  direction?: 'up' | 'down';
}

interface TileSpec {
  label: string;
  field: string;
  format?: 'number' | 'currency' | 'count';
  icon?: string;
  trend?: TrendSpec;
}

function formatValue(value: unknown, format: TileSpec['format']): string {
  if (value === null || value === undefined || value === '') return '—';
  const num = typeof value === 'number' ? value : Number(value);
  if (Number.isNaN(num)) return String(value);
  switch (format) {
    case 'currency':
      return num.toLocaleString(undefined, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });
    case 'count':
      return String(Math.round(num));
    case 'number':
    default:
      return num.toLocaleString();
  }
}

export function SummaryTilesWidget({ view, isLoading }: ViewWidgetProps) {
  const config = (view.config || {}) as Record<string, unknown>;
  const rawBindings = (config.__bindings || {}) as Record<string, unknown>;
  const hostEntryId =
    typeof rawBindings.entryId === 'string' ? rawBindings.entryId : undefined;
  const title = typeof config.title === 'string' ? config.title : undefined;
  const tiles: TileSpec[] = Array.isArray(config.tiles)
    ? (config.tiles as TileSpec[]).filter(t => t && typeof t.field === 'string')
    : [];

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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- bindings is a
    // fresh object every render; only its __refreshKey member should
    // re-trigger this fetch (see RelatedViewsSection.tsx's docstring on
    // the shared refresh-nonce convention — e.g. clicking "Generate
    // Payslips" should refresh the Gross Total/Headcount tiles here
    // without a full page reopen).
  }, [hostEntryId, rawBindings.__refreshKey]);

  if (isLoading || loadingEntry) {
    return <Surface tone="panel-2" radius="input" className="h-16 animate-pulse">{null}</Surface>;
  }

  if (!entry || !tiles.length) {
    return null;
  }

  const values = entry.custom_fields || {};

  return (
    <Surface tone="panel" border="default" radius="card" padding="md">
      {title && (
        <Text as="h3" variant="heading-sm" className="mb-3">{title}</Text>
      )}
      <div className="flex flex-wrap gap-4">
        {tiles.map(tile => {
          const TileIcon = tile.icon ? (Icons[tile.icon as keyof typeof Icons] as LucideIcon | undefined) : undefined;
          const trendRaw = tile.trend ? values[tile.trend.field] : undefined;
          const trendNum = trendRaw === null || trendRaw === undefined ? NaN : Number(trendRaw);
          const trendDirection =
            tile.trend?.direction ?? (trendNum < 0 ? 'down' : trendNum > 0 ? 'up' : undefined);
          return (
            <Surface
              key={tile.field}
              tone="panel-2"
              border="default"
              radius="input"
              padding="md"
              className="flex-1 min-w-[140px]"
            >
              <div className="flex items-center gap-1.5">
                {TileIcon && <TileIcon size={14} strokeWidth={1.5} aria-hidden="true" />}
                <Text as="div" variant="label" tone="muted" className="uppercase tracking-wide">
                  {tile.label}
                </Text>
              </div>
              <div className="mt-1 flex items-baseline gap-2">
                <Text as="span" variant="heading-sm">
                  {formatValue(values[tile.field], tile.format)}
                </Text>
                {tile.trend && !Number.isNaN(trendNum) && (
                  <Text
                    as="span"
                    variant="body-sm"
                    tone={trendDirection === 'down' ? 'danger' : trendDirection === 'up' ? 'success' : 'muted'}
                  >
                    {trendDirection === 'down' ? '↓' : trendDirection === 'up' ? '↑' : ''}
                    {' '}
                    {formatValue(Math.abs(trendNum), tile.trend.format)}
                  </Text>
                )}
              </div>
            </Surface>
          );
        })}
      </div>
    </Surface>
  );
}
