import { useEffect, useMemo, useState } from 'react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  PolarAngleAxis,
  RadialBar,
  RadialBarChart,
  Scatter,
  ScatterChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { entriesApi } from '../../api';
import { aggregate, getFieldValue, groupBy, type AggregateMode } from './chartAggregate';
import { useRelationLabels } from '../entries/relations';
import { Surface, Text } from '../../ui';
import type { ViewWidgetProps } from './types';
import type { Entry } from '../../types';

/**
 * Config-driven chart region — the reusable Oracle-APEX-style "Chart"
 * region. Two data sources:
 *
 *   - ``source: 'self'`` — reads numeric fields directly off the bound
 *     entry (``bindings.entryId``, same self-fetch pattern as
 *     ``FormRegionWidget``). ``fields: {key, label}[]`` names which
 *     custom_fields to plot as one point each (e.g. employer vs employee
 *     contribution on a single filing). Falls back to a single point from
 *     ``x_field``/``y_field`` if ``fields`` isn't given.
 *   - ``source: 'track'`` (default) — aggregates over the widget's own
 *     ``entries`` prop (already delivered by ``ComposableViewSlot``, capped
 *     at 200) via ``chartAggregate.ts``'s ``groupBy``/``aggregate``,
 *     grouping by ``group_by`` (falls back to ``x_field``) and reducing
 *     with ``aggregate`` (``count``|``sum``|``avg``, default ``count``)
 *     over ``y_field``.
 *
 * Config: ``{chart_type: 'bar'|'line'|'area'|'scatter'|'pie'|'donut'|
 * 'gauge', x_field, y_field?, aggregate?, group_by?, source?, title?,
 * fields?, gauge_max?}``.
 *
 * ``gauge`` renders a single value (the FIRST data point only — a gauge
 * inherently shows one number, not a series) as a semi-circle progress
 * ring against ``gauge_max`` (default 100, so a plain percentage field
 * needs no extra config).
 */

const CHART_COLORS = [
  'var(--chart-1, #6366f1)',
  'var(--chart-2, #22c55e)',
  'var(--chart-3, #f59e0b)',
  'var(--chart-4, #ec4899)',
  'var(--chart-5, #14b8a6)',
  'var(--chart-6, #8b5cf6)',
];

interface DataPoint {
  name: string;
  value: number;
}

export function ChartRegionWidget({ view, entries, isLoading, fields }: ViewWidgetProps) {
  const config = (view.config || {}) as Record<string, unknown>;
  const bindings = (config.__bindings || {}) as Record<string, unknown>;
  const hostEntryId = typeof bindings.entryId === 'string' ? bindings.entryId : undefined;

  const chartType = (config.chart_type as string) || 'bar';
  const xField = typeof config.x_field === 'string' ? config.x_field : undefined;
  const yField = typeof config.y_field === 'string' ? config.y_field : undefined;
  const aggMode = (config.aggregate as AggregateMode) || 'count';
  const gaugeMax = typeof config.gauge_max === 'number' ? config.gauge_max : 100;
  const groupField = typeof config.group_by === 'string' ? config.group_by : xField;
  const source = (config.source as string) || 'track';
  const title = typeof config.title === 'string' ? config.title : undefined;
  const selfFields = Array.isArray(config.fields)
    ? (config.fields as { key: string; label?: string }[])
    : undefined;

  const [selfEntry, setSelfEntry] = useState<Entry | null>(null);
  const [loadingSelf, setLoadingSelf] = useState(source === 'self');

  useEffect(() => {
    if (source !== 'self') {
      setSelfEntry(null);
      return;
    }
    if (!hostEntryId) {
      setLoadingSelf(false);
      return;
    }
    let cancelled = false;
    setLoadingSelf(true);
    entriesApi
      .get(hostEntryId)
      .then(e => {
        if (!cancelled) setSelfEntry(e);
      })
      .catch(() => {
        if (!cancelled) setSelfEntry(null);
      })
      .finally(() => {
        if (!cancelled) setLoadingSelf(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- bindings is a
    // fresh object every render; only its __refreshKey member should
    // re-trigger this fetch (see RelatedViewsSection.tsx's docstring on
    // the shared refresh-nonce convention).
  }, [source, hostEntryId, bindings.__refreshKey]);

  // `group_by`'s field spec, if it's declared on the entry type — used to
  // detect a relation-typed group key so its ids can be resolved to display
  // labels instead of rendering raw `n.Entry.…` strings on the chart axis.
  const groupFieldKey = groupField?.startsWith('custom_fields.')
    ? groupField.slice('custom_fields.'.length)
    : groupField;
  const groupFieldSpec = fields?.find(f => f.key === groupFieldKey);
  const isRelationGroup =
    source !== 'self' && String(groupFieldSpec?.type || '').toLowerCase() === 'relation';

  const points = useMemo(() => {
    if (source === 'self' || !groupField) return [];
    const groups = groupBy(entries, groupField);
    return aggregate(groups, { mode: aggMode, valueField: yField });
  }, [source, entries, groupField, aggMode, yField]);

  // `points[].key` is already the raw (string) relation id — `groupBy`
  // never resolves relation values (see chartAggregate.ts's `toGroupKey`),
  // it only stringifies them. One batched hook call resolves them all;
  // React Query collapses duplicate/concurrent id lookups into one fetch
  // (see `useRelationLabels`), so this stays cheap even with many groups.
  const relationIds = useMemo(
    () => (isRelationGroup ? points.map(p => p.key).filter(k => k !== '(none)') : []),
    [isRelationGroup, points]
  );
  const { targets: relationTargets } = useRelationLabels(
    relationIds,
    groupFieldSpec?.relation
  );
  const relationLabelById = useMemo(() => {
    const m = new Map<string, string>();
    for (const t of relationTargets) m.set(t.id, t.label);
    return m;
  }, [relationTargets]);

  const data = useMemo<DataPoint[]>(() => {
    if (source === 'self') {
      if (!selfEntry) return [];
      if (selfFields?.length) {
        return selfFields.map(f => ({
          name: f.label || f.key,
          value: Number(getFieldValue(selfEntry, f.key)) || 0,
        }));
      }
      if (xField && yField) {
        return [{ name: xField, value: Number(getFieldValue(selfEntry, yField)) || 0 }];
      }
      return [];
    }
    if (!groupField) return [];
    // Fall back to the raw key (never blank the axis) if a label hasn't
    // resolved yet or resolution failed for that id.
    return points.map(p => ({
      name: isRelationGroup ? relationLabelById.get(p.key) ?? p.key : p.key,
      value: p.value,
    }));
  }, [source, selfEntry, selfFields, xField, yField, groupField, points, isRelationGroup, relationLabelById]);

  const busy = isLoading || (source === 'self' && loadingSelf);

  if (busy) {
    return <Surface tone="panel-2" radius="input" className="h-48 animate-pulse">{null}</Surface>;
  }

  if (!data.length) {
    return (
      <Text as="div" variant="body-sm" tone="muted" className="p-6 text-center">
        No data to chart.
      </Text>
    );
  }

  return (
    <div data-testid="chart-region-widget">
      <Surface tone="panel" border="default" radius="card" padding="md">
        {title && <Text as="h3" variant="heading-sm" className="mb-3">{title}</Text>}
        <div style={{ width: '100%', height: chartType === 'gauge' ? 160 : 240 }}>
          <ResponsiveContainer>{renderChart(chartType, data, gaugeMax)}</ResponsiveContainer>
        </div>
      </Surface>
    </div>
  );
}

function renderChart(chartType: string, data: DataPoint[], gaugeMax: number) {
  const axisStroke = 'var(--text-muted)';
  const gridStroke = 'var(--panel-border)';

  if (chartType === 'line') {
    return (
      <LineChart data={data}>
        <XAxis dataKey="name" stroke={axisStroke} tick={{ fill: axisStroke, fontSize: 12 }} />
        <YAxis stroke={axisStroke} tick={{ fill: axisStroke, fontSize: 12 }} />
        <Tooltip />
        <Line type="monotone" dataKey="value" stroke={CHART_COLORS[0]} strokeWidth={2} dot />
      </LineChart>
    );
  }
  if (chartType === 'area') {
    return (
      <AreaChart data={data}>
        <XAxis dataKey="name" stroke={axisStroke} tick={{ fill: axisStroke, fontSize: 12 }} />
        <YAxis stroke={axisStroke} tick={{ fill: axisStroke, fontSize: 12 }} />
        <Tooltip />
        <Area
          type="monotone"
          dataKey="value"
          stroke={CHART_COLORS[0]}
          fill={CHART_COLORS[0]}
          fillOpacity={0.25}
          strokeWidth={2}
        />
      </AreaChart>
    );
  }
  if (chartType === 'scatter') {
    return (
      <ScatterChart>
        <XAxis dataKey="name" stroke={axisStroke} tick={{ fill: axisStroke, fontSize: 12 }} />
        <YAxis dataKey="value" stroke={axisStroke} tick={{ fill: axisStroke, fontSize: 12 }} />
        <Tooltip cursor={{ strokeDasharray: '3 3' }} />
        <Scatter data={data} fill={CHART_COLORS[0]} />
      </ScatterChart>
    );
  }
  if (chartType === 'gauge') {
    // A gauge shows ONE number — the first point only, as a semi-circle
    // progress ring against gaugeMax (default 100, so a plain percentage
    // field needs no extra config). recharts has no native gauge type;
    // this is the standard RadialBarChart-as-gauge pattern (180°→0° arc,
    // a single bar, the value overlaid as centered text).
    const point = data[0];
    const pct = gaugeMax > 0 ? Math.min(100, Math.max(0, (point.value / gaugeMax) * 100)) : 0;
    return (
      <RadialBarChart
        data={[{ name: point.name, value: pct }]}
        startAngle={180}
        endAngle={0}
        innerRadius="70%"
        outerRadius="100%"
        barSize={16}
      >
        <PolarAngleAxis type="number" domain={[0, 100]} tick={false} />
        <RadialBar dataKey="value" fill={CHART_COLORS[0]} background={{ fill: gridStroke }} cornerRadius={8} />
        <text
          x="50%"
          y="72%"
          textAnchor="middle"
          style={{ fontSize: 20, fontWeight: 600, fill: 'var(--text)' }}
        >
          {point.value.toLocaleString()}
        </text>
      </RadialBarChart>
    );
  }
  if (chartType === 'pie' || chartType === 'donut') {
    return (
      <PieChart>
        <Tooltip />
        <Pie
          data={data}
          dataKey="value"
          nameKey="name"
          innerRadius={chartType === 'donut' ? 50 : 0}
          outerRadius={90}
        >
          {data.map((_, i) => (
            <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
          ))}
        </Pie>
      </PieChart>
    );
  }
  // 'bar' (default)
  return (
    <BarChart data={data}>
      <XAxis
        dataKey="name"
        stroke={axisStroke}
        tick={{ fill: axisStroke, fontSize: 12 }}
      />
      <YAxis stroke={axisStroke} tick={{ fill: axisStroke, fontSize: 12 }} />
      <Tooltip cursor={{ fill: gridStroke, opacity: 0.3 }} />
      <Bar dataKey="value" radius={[4, 4, 0, 0]}>
        {data.map((_, i) => (
          <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
        ))}
      </Bar>
    </BarChart>
  );
}
