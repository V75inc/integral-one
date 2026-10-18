import { useEffect, useState, type CSSProperties } from 'react';
import * as Collapsible from '@radix-ui/react-collapsible';
import { ChevronDown } from 'lucide-react';
import { ComposableViewSlot } from './ComposableViewSlot';
import { FormRegionWidget } from './FormRegionWidget';
import { Surface, Text } from '../../ui';
import {
  isVisible,
  LiveValuesContext,
  useLiveValuesProvider,
  type ConditionalFieldEntry,
  type VisibleIf,
} from './regionConditions';
import type { ViewWidgetProps } from './types';
import type { SavedView } from '../../types';

// ── Region layout engine ─────────────────────────────────────────────────
// Grid/flex primitives + responsive breakpoints for region composition —
// deliberately living in this one widget file (our region system), not the
// platform's own layout code. A value of type `Responsive<T>` is either a
// bare T (same at every breakpoint) or `{desktop?, tablet?, mobile?}` for
// per-breakpoint overrides, matching every existing plain config value
// (backward compatible: omitting `layout` entirely keeps stack/tabs/
// accordion behavior exactly as before).

type Breakpoint = 'mobile' | 'tablet' | 'desktop';
type Responsive<T> = T | { desktop?: T; tablet?: T; mobile?: T };

function classifyBreakpoint(width: number): Breakpoint {
  if (width < 640) return 'mobile';
  if (width < 1024) return 'tablet';
  return 'desktop';
}

/** Tracks the viewport breakpoint (resize-reactive) for responsive region
 *  layout — mobile <640px, tablet 640–1023px, desktop >=1024px. */
function useBreakpoint(): Breakpoint {
  const [bp, setBp] = useState<Breakpoint>(() =>
    classifyBreakpoint(typeof window !== 'undefined' ? window.innerWidth : 1280)
  );
  useEffect(() => {
    const onResize = () => setBp(classifyBreakpoint(window.innerWidth));
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  return bp;
}

/** Resolves a `Responsive<T>` value for the current breakpoint, cascading
 *  toward desktop as the base when a more specific breakpoint isn't set
 *  (mobile falls back to tablet then desktop; tablet falls back to desktop). */
function resolveResponsive<T>(value: Responsive<T> | undefined, bp: Breakpoint, fallback: T): T {
  if (value === undefined) return fallback;
  if (typeof value === 'object' && value !== null) {
    const obj = value as { desktop?: T; tablet?: T; mobile?: T };
    if (bp === 'mobile') return obj.mobile ?? obj.tablet ?? obj.desktop ?? fallback;
    if (bp === 'tablet') return obj.tablet ?? obj.desktop ?? fallback;
    return obj.desktop ?? fallback;
  }
  return value as T;
}

type GapSize = 'none' | 'sm' | 'md' | 'lg';
const GAP_PX: Record<GapSize, number> = { none: 0, sm: 8, md: 12, lg: 20 };

type GridLayoutConfig = {
  columns?: Responsive<number>;
  gap?: GapSize;
};

type FlexLayoutConfig = {
  direction?: 'row' | 'column';
  align?: 'start' | 'center' | 'end' | 'stretch';
  justify?: 'start' | 'center' | 'end' | 'between' | 'around';
  gap?: GapSize;
  wrap?: boolean;
};

/** Per-region placement override within a grid/flex container. `span`/
 *  `order` (grid) and `grow`/`shrink`/`basis` (flex) are independent —
 *  a region only uses whichever apply to the container's own mode. */
type RegionLayoutOverride = {
  span?: Responsive<number>;
  order?: Responsive<number>;
  /** Grid mode only — explicit 1-indexed column start (CSS `grid-column-
   *  start`). Combined with `span` for exact placement instead of
   *  auto-flow — e.g. `{column: 9, span: 4}` on a 12-column grid puts
   *  this region in the last third of the row regardless of what came
   *  before it. Omitted = auto-placed (the grid packs regions left to
   *  right, wrapping), same as before this existed. */
  column?: Responsive<number>;
  /** Grid mode only — explicit 1-indexed row start (CSS `grid-row-
   *  start`). Two regions given the SAME `row` (with non-overlapping
   *  `column`/`span`) sit side by side on that row; a region on a LATER
   *  row starts a new line regardless of how full the previous row is —
   *  the actual mechanism for "put these three regions in a row, then
   *  this one full-width below them" instead of relying on auto-flow
   *  wrapping to happen to land there. Omitted = auto-placed. */
  row?: Responsive<number>;
  grow?: number;
  shrink?: number;
  basis?: string;
};

/** Gate a region on another field's current value — e.g. only show a
 *  "Pay Period Dates" region when `schedule_type` is "Weekly". Evaluated
 *  against the first bound entry's `custom_fields` (this widget renders
 *  inside an entry's own related_views, so there's always exactly one
 *  entry in scope — see `ViewWidgetProps.entries`). Absent `visible_if`
 *  means always visible (backward compatible with every existing config).
 *  `VisibleIf`/`isVisible` live in `regionConditions.ts` — shared with
 *  FormRegionWidget's per-field and EditableTableWidget's per-column gates,
 *  same condition shape everywhere in the region system.
 */
type ViewRegionSpec = {
  key: string;
  kind: 'view';
  title?: string;
  view: string;
  bind?: Record<string, unknown>;
  visible_if?: VisibleIf;
  layout?: RegionLayoutOverride;
  /** Optional accent color (any CSS color — hex/rgb/named), same
   *  free-form-string-from-config convention as tag colors elsewhere in
   *  the app. The region's own card takes on that color (tint fill +
   *  matching border), in every mode (stack/tabs/accordion/grid/flex) —
   *  a per-region visual accent, not a new design token. */
  accent?: string;
  /** Stack mode only — render this region behind a collapse/expand
   *  toggle instead of always-open. `default_open` (default `true`)
   *  sets its initial state. Other modes ignore this — accordion is
   *  already collapse-by-nature, and tabs/grid/flex don't have a natural
   *  "collapsed" state for a single region. */
  collapsible?: boolean;
  default_open?: boolean;
};

type FormRegionSpec = {
  key: string;
  kind: 'form';
  title?: string;
  fields: ConditionalFieldEntry[];
  columns?: number;
  visible_if?: VisibleIf;
  layout?: RegionLayoutOverride;
  accent?: string;
  collapsible?: boolean;
  default_open?: boolean;
};

type RegionSpec = ViewRegionSpec | FormRegionSpec;

/** A region's own `accent` as an inline wrapper style — the region's own
 *  card actually takes on that color (a readable tint fill + matching
 *  border), not a decorative left-border stripe. Uses the color string
 *  as-is (hex/rgb/named all work as inline CSS, same as the existing
 *  free-form tag-color convention elsewhere in the app). Kept as plain
 *  inline style rather than a Tailwind class since the accent is
 *  caller-supplied runtime data, not a fixed design token. Returns `{}`
 *  when no accent is set — every mode below applies this unconditionally,
 *  so an unaccented region renders exactly as it did before this existed. */
function regionAccentStyle(accent?: string): CSSProperties {
  if (!accent) return {};
  return {
    backgroundColor: `color-mix(in srgb, ${accent} 14%, transparent)`,
    border: `1px solid color-mix(in srgb, ${accent} 40%, transparent)`,
    borderRadius: 'var(--radius-card)',
    padding: '0.75rem',
  };
}

/**
 * Grid/flex/stack/tabs/accordion wrapper composing an ordered list of child
 * regions — the reusable Oracle-APEX-style Region layout primitive. Sits
 * within a single ``related_views[]`` placement slot; does not itself
 * change where that slot renders (see ``EntryDetail.tsx``'s existing
 * ``position: 'primary'|'related'`` split, unmodified by this widget).
 *
 * Config: ``{regions: RegionSpec[], mode?: 'stack'|'tabs'|'accordion'|'grid'|'flex', title?, layout?}``.
 * ``mode`` itself may be a bare string (same at every breakpoint) or
 * ``{desktop?, tablet?, mobile?}`` — the composition strategy can switch
 * entirely per viewport (e.g. ``tabs`` on desktop, ``stack`` on mobile,
 * where a horizontal tab strip wouldn't fit), same ``Responsive<T>``
 * resolution every layout value already uses.
 *
 * ``layout`` (grid/flex modes only): ``{columns?, gap?}`` for grid,
 * ``{direction?, align?, justify?, gap?, wrap?}`` for flex. Any of these may
 * be a bare value (same at every breakpoint) or ``{desktop?, tablet?,
 * mobile?}`` for responsive overrides — see ``Responsive<T>`` above.
 *
 * Each region may carry its own ``layout: {span?, order?, column?, row?}``
 * (grid) or ``{grow?, shrink?, basis?}`` (flex) placement override, same
 * responsive shape. Omitted entirely = full-width / natural flex sizing.
 * Grid mode's ``column``/``row`` are explicit 1-indexed CSS grid-column-
 * start/grid-row-start — the actual APEX-style "put this region at
 * exactly this position" control, not just auto-flow ordering: two
 * regions sharing the same ``row`` (with non-overlapping ``column``/
 * ``span``) sit side by side regardless of declaration order; a region
 * on a later ``row`` starts a new line even if the previous row isn't
 * full. Omitting both falls back to plain auto-flow (pack left to right,
 * wrap), unchanged from before this existed.
 *
 * Stack mode only: a region with ``collapsible: true`` renders behind its
 * own collapse/expand toggle (``default_open`` sets the initial state,
 * default ``true``) — independent per region, unlike accordion mode where
 * every region is collapsible by definition.
 *
 * Each region may also carry its own ``accent`` — any CSS color string
 * (hex/rgb/named), rendered as a left-border stripe + faint tinted wash in
 * every mode (stack/grid/flex wrapper; tabs' underline + a colored dot next
 * to the label; accordion's own left border). Caller-supplied runtime
 * data, not a new design token — same free-form-color convention already
 * used for tag colors elsewhere in the app. Omitted = unaccented, unchanged
 * from before this existed.
 *
 * ``kind:'view'`` children mount a nested ``ComposableViewSlot`` scoped to
 * THIS container's own resolved track (``view.track_id``) and forward the
 * same ``bindings`` the container itself received — cross-track / anchor-
 * boundary composition is out of scope by design (the ``:anchored_track/...``
 * resolver token only resolves once per top-level related_views entry; see
 * the plan's "Cross-track composition boundary" note). Multi-track layouts
 * (e.g. NIS/PAYE's header + anchored employee-line table) continue to use
 * multiple sibling ``position: primary`` related_views entries instead.
 *
 * ``kind:'form'`` children reuse ``FormRegionWidget`` directly (imported,
 * not duplicated) via a small synthetic ``SavedView`` carrying the child's
 * ``fields``/``title``/``columns`` as its config and the container's own
 * bindings forwarded through.
 */
export function LayoutContainerWidget({ view, entries, isLoading, onEntryOpen }: ViewWidgetProps) {
  const config = (view.config || {}) as Record<string, unknown>;
  const bindings = (config.__bindings || {}) as Record<string, unknown>;
  const allRegions = (Array.isArray(config.regions) ? config.regions : []) as RegionSpec[];
  // Shared live-values channel — see regionConditions.ts's
  // useLiveValuesProvider docstring. Region-level visible_if (below) reads
  // from `live.values`, not the entries prop directly, and every sibling
  // region's FormRegionWidget both reads from and writes into the same
  // object via LiveValuesContext.Provider (wrapped around every mode's
  // render below) — so a field committed in one region is visible to a
  // visible_if check in another immediately, no reload.
  // Compose shells pass ``entries={[]}``; seed from draft bindings instead so
  // FormRegion / visible_if see host defaults ($today, etc.) immediately.
  const draftEntryValues = bindings.entryValues as Record<string, unknown> | undefined;
  const live = useLiveValuesProvider(
    (entries[0]?.custom_fields as Record<string, unknown> | undefined) || draftEntryValues
  );
  // Filtered once, up front — every mode below (stack/tabs/accordion/grid/
  // flex) maps over this same list, so a hidden region never gets a tab/
  // accordion header or a grid cell of its own either, not just an empty body.
  const regions = allRegions.filter(r => isVisible(r.visible_if, live.values));
  const breakpoint = useBreakpoint();
  // `mode` may be a bare string (same at every breakpoint, the common
  // case) or `{desktop?, tablet?, mobile?}` to switch composition
  // strategy entirely per viewport — e.g. tabs on desktop, stack on
  // mobile, where a horizontal tab strip wouldn't fit. Same Responsive<T>
  // resolution every other layout value already uses.
  const mode = resolveResponsive(
    config.mode as Responsive<string> | undefined,
    breakpoint,
    'stack'
  );
  const title = typeof config.title === 'string' ? config.title : undefined;

  const [activeTab, setActiveTab] = useState(0);
  const [openAccordion, setOpenAccordion] = useState<Set<number>>(
    () => new Set(regions.map((_, i) => i))
  );
  // Stack mode's own per-region collapse state, keyed by region key (not
  // index — index-keying would desync if visible_if changes which
  // regions are present between renders). Only entries for regions with
  // `collapsible: true` are ever consulted; absent = default_open
  // (default true).
  const [openStackRegions, setOpenStackRegions] = useState<Record<string, boolean>>({});

  if (!regions.length) return null;

  const renderRegion = (region: RegionSpec) => {
    if (region.kind === 'view') {
      return (
        <ComposableViewSlot
          trackId={view.track_id}
          viewKey={region.view}
          bindings={{ ...bindings, ...(region.bind || {}) }}
        />
      );
    }
    // Stack/grid/flex already render ``region.title`` as the section label.
    // Do not also pass it into FormRegionWidget or every form region shows
    // the heading twice (CONTACT + Contact) — that reads as unfinished chrome.
    const syntheticView: SavedView = {
      ...view,
      id: `${view.id}:${region.key}`,
      type: 'form_region',
      track_id: view.track_id,
      // Prefer the container's default entry type so form regions on a
      // multi-type track (e.g. Customers polluted with Invoice) still bind
      // the contributed entry type's fields.
      default_entry_type_key:
        view.default_entry_type_key ||
        (Array.isArray(view.entry_type_keys) ? view.entry_type_keys[0] : undefined),
      config: {
        fields: region.fields,
        columns: region.columns,
        __bindings: bindings,
      },
    } as SavedView;
    return (
      <FormRegionWidget
        view={syntheticView}
        entries={entries}
        isLoading={isLoading}
        onEntryOpen={onEntryOpen}
      />
    );
  };

  if (mode === 'grid') {
    const layoutConfig = (config.layout || {}) as GridLayoutConfig;
    const columns = resolveResponsive(layoutConfig.columns, breakpoint, 12);
    const gap = GAP_PX[layoutConfig.gap || 'md'];
    return (
      <LiveValuesContext.Provider value={live}>
        <div data-testid="layout-container-widget" data-mode="grid">
          {title && <Text as="h3" variant="heading-sm" className="mb-2">{title}</Text>}
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`, gap }}>
            {regions.map(region => {
              const rl = (region.layout || {}) as RegionLayoutOverride;
              const span = Math.min(resolveResponsive(rl.span, breakpoint, columns), columns);
              const order = resolveResponsive(rl.order, breakpoint, undefined);
              const columnStart = resolveResponsive(rl.column, breakpoint, undefined);
              const rowStart = resolveResponsive(rl.row, breakpoint, undefined);
              return (
                <div
                  key={region.key}
                  style={{
                    gridColumn: columnStart
                      ? `${columnStart} / span ${span}`
                      : `span ${span} / span ${span}`,
                    gridRow: rowStart ? `${rowStart}` : undefined,
                    order,
                    ...regionAccentStyle(region.accent),
                  }}
                >
                  {region.title && (
                    <Text as="h4" variant="label" tone="muted" className="uppercase tracking-wide mb-1.5">
                      {region.title}
                    </Text>
                  )}
                  {renderRegion(region)}
                </div>
              );
            })}
          </div>
        </div>
      </LiveValuesContext.Provider>
    );
  }

  if (mode === 'flex') {
    const layoutConfig = (config.layout || {}) as FlexLayoutConfig;
    const gap = GAP_PX[layoutConfig.gap || 'md'];
    const alignMap: Record<NonNullable<FlexLayoutConfig['align']>, string> = {
      start: 'flex-start', center: 'center', end: 'flex-end', stretch: 'stretch',
    };
    const justifyMap: Record<NonNullable<FlexLayoutConfig['justify']>, string> = {
      start: 'flex-start', center: 'center', end: 'flex-end', between: 'space-between', around: 'space-around',
    };
    return (
      <LiveValuesContext.Provider value={live}>
        <div data-testid="layout-container-widget" data-mode="flex">
          {title && <Text as="h3" variant="heading-sm" className="mb-2">{title}</Text>}
          <div
            style={{
              display: 'flex',
              flexDirection: layoutConfig.direction === 'column' ? 'column' : 'row',
              alignItems: alignMap[layoutConfig.align || 'stretch'],
              justifyContent: justifyMap[layoutConfig.justify || 'start'],
              gap,
              flexWrap: layoutConfig.wrap ? 'wrap' : 'nowrap',
            }}
          >
            {regions.map(region => {
              const rl = (region.layout || {}) as RegionLayoutOverride;
              return (
                <div
                  key={region.key}
                  style={{
                    flexGrow: rl.grow ?? 0,
                    flexShrink: rl.shrink ?? 1,
                    flexBasis: rl.basis ?? 'auto',
                    ...regionAccentStyle(region.accent),
                  }}
                >
                  {region.title && (
                    <Text as="h4" variant="label" tone="muted" className="uppercase tracking-wide mb-1.5">
                      {region.title}
                    </Text>
                  )}
                  {renderRegion(region)}
                </div>
              );
            })}
          </div>
        </div>
      </LiveValuesContext.Provider>
    );
  }

  if (mode === 'tabs') {
    return (
      <LiveValuesContext.Provider value={live}>
        <div data-testid="layout-container-widget" data-mode="tabs">
        <Surface tone="panel" border="default" radius="card">
          {title && (
            <Text as="h3" variant="heading-sm" className="px-4 pt-4">{title}</Text>
          )}
          <div className="flex gap-1 border-b border-[var(--panel-border)] px-2">
            {regions.map((region, i) => (
              <button
                key={region.key}
                type="button"
                onClick={() => setActiveTab(i)}
                style={
                  activeTab === i && region.accent
                    ? { borderBottomColor: region.accent }
                    : undefined
                }
                className={`flex items-center gap-1.5 px-3 py-2 border-b-2 transition-colors ${
                  activeTab === i ? 'border-[var(--link)]' : 'border-transparent'
                }`}
              >
                {region.accent && (
                  <span
                    className="inline-block w-1.5 h-1.5 rounded-full"
                    style={{ backgroundColor: region.accent }}
                  />
                )}
                <Text as="span" variant="body-sm" weight="medium" tone={activeTab === i ? undefined : 'muted'}>
                  {region.title || region.key}
                </Text>
              </button>
            ))}
          </div>
          <div className="p-4" style={regionAccentStyle(regions[activeTab]?.accent)}>
            {regions[activeTab] ? renderRegion(regions[activeTab]) : null}
          </div>
        </Surface>
        </div>
      </LiveValuesContext.Provider>
    );
  }

  if (mode === 'accordion') {
    return (
      <LiveValuesContext.Provider value={live}>
        <div
          className="flex flex-col gap-2"
          data-testid="layout-container-widget"
          data-mode="accordion"
        >
          {title && <Text as="h3" variant="heading-sm">{title}</Text>}
          {regions.map((region, i) => {
            const open = openAccordion.has(i);
            return (
              <Collapsible.Root
                key={region.key}
                open={open}
                onOpenChange={next => {
                  setOpenAccordion(prev => {
                    const nextSet = new Set(prev);
                    if (next) nextSet.add(i);
                    else nextSet.delete(i);
                    return nextSet;
                  });
                }}
                style={
                  region.accent
                    ? {
                        backgroundColor: `color-mix(in srgb, ${region.accent} 14%, transparent)`,
                        border: `1px solid color-mix(in srgb, ${region.accent} 40%, transparent)`,
                        borderRadius: 'var(--radius-card)',
                      }
                    : undefined
                }
              >
                <Surface
                  tone={region.accent ? 'transparent' : 'panel'}
                  border={region.accent ? 'none' : 'default'}
                  radius="card"
                  className="overflow-hidden"
                >
                  <Collapsible.Trigger asChild>
                    <button
                      type="button"
                      className="flex w-full items-center justify-between px-4 py-2.5"
                    >
                      {region.title || region.key}
                      <ChevronDown
                        size={14}
                        strokeWidth={1.5}
                        className={`transition-transform ${open ? 'rotate-180' : ''}`}
                      />
                    </button>
                  </Collapsible.Trigger>
                  <Collapsible.Content className="px-4 pb-4">
                    {renderRegion(region)}
                  </Collapsible.Content>
                </Surface>
              </Collapsible.Root>
            );
          })}
        </div>
      </LiveValuesContext.Provider>
    );
  }

  // 'stack' (default)
  return (
    <LiveValuesContext.Provider value={live}>
      <div
        className="flex flex-col gap-3"
        data-testid="layout-container-widget"
        data-mode="stack"
      >
        {title && <Text as="h3" variant="heading-sm">{title}</Text>}
        {regions.map(region => {
          if (!region.collapsible) {
            return (
              <div key={region.key} style={regionAccentStyle(region.accent)}>
                {region.title && (
                  <Text as="h4" variant="label" tone="muted" className="uppercase tracking-wide mb-1.5">
                    {region.title}
                  </Text>
                )}
                {renderRegion(region)}
              </div>
            );
          }
          const open = openStackRegions[region.key] ?? region.default_open ?? true;
          return (
            <Collapsible.Root
              key={region.key}
              open={open}
              onOpenChange={next =>
                setOpenStackRegions(prev => ({ ...prev, [region.key]: next }))
              }
              style={regionAccentStyle(region.accent)}
            >
              <Collapsible.Trigger asChild>
                <button
                  type="button"
                  className="flex w-full items-center justify-between gap-1.5 mb-1.5"
                >
                  <Text as="span" variant="label" tone="muted" className="uppercase tracking-wide">
                    {region.title || region.key}
                  </Text>
                  <ChevronDown
                    size={14}
                    strokeWidth={1.5}
                    className={`transition-transform ${open ? 'rotate-180' : ''}`}
                  />
                </button>
              </Collapsible.Trigger>
              <Collapsible.Content>{renderRegion(region)}</Collapsible.Content>
            </Collapsible.Root>
          );
        })}
      </div>
    </LiveValuesContext.Provider>
  );
}
