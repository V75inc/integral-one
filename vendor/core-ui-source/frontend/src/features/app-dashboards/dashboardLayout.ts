import type { DashboardWidget } from '../../api/dashboards';

export type GridLayoutItem = {
  i: string;
  x: number;
  y: number;
  w: number;
  h: number;
  minW?: number;
  minH?: number;
};

function gridOf(w: DashboardWidget) {
  return w.grid ?? { x: 0, y: 0, w: 4, h: 3 };
}

function overlaps(
  a: { x: number; y: number; w: number; h: number },
  b: { x: number; y: number; w: number; h: number },
): boolean {
  return !(
    a.x + a.w <= b.x ||
    b.x + b.w <= a.x ||
    a.y + a.h <= b.y ||
    b.y + b.h <= a.y
  );
}

/** True when every widget shares the same x column (typical agent mistake). */
export function isSingleColumnStack(widgets: DashboardWidget[]): boolean {
  if (widgets.length <= 1) return false;
  const xs = new Set(widgets.map(w => gridOf(w).x));
  return xs.size === 1;
}

export function hasOverlappingWidgets(widgets: DashboardWidget[]): boolean {
  for (let i = 0; i < widgets.length; i += 1) {
    for (let j = i + 1; j < widgets.length; j += 1) {
      if (overlaps(gridOf(widgets[i]), gridOf(widgets[j]))) return true;
    }
  }
  return false;
}

export function needsDashboardReflow(
  widgets: DashboardWidget[],
  _columns = 12,
): boolean {
  if (widgets.length <= 1) return false;
  return isSingleColumnStack(widgets) || hasOverlappingWidgets(widgets);
}

/**
 * Row-major reflow — fills rows left-to-right, wrapping when a widget
 * would exceed the column count. Good for agent-generated single-column stacks.
 */
export function reflowDashboardWidgets(
  widgets: DashboardWidget[],
  columns = 12,
): DashboardWidget[] {
  let x = 0;
  let y = 0;
  let rowH = 0;

  return widgets.map(w => {
    const g = gridOf(w);
    const gw = Math.min(Math.max(g.w, 1), columns);
    const gh = Math.max(g.h, 1);

    if (x > 0 && x + gw > columns) {
      x = 0;
      y += rowH;
      rowH = 0;
    }

    const next: DashboardWidget = {
      ...w,
      grid: { x, y, w: gw, h: gh }
    };
    x += gw;
    rowH = Math.max(rowH, gh);
    return next;
  });
}

/** Move widgets upward to close vertical gaps (mirrors RGL vertical compact). */
export function compactDashboardVertical(
  widgets: DashboardWidget[],
  _columns = 12,
): DashboardWidget[] {
  const sorted = [...widgets].sort(
    (a, b) => gridOf(a).y - gridOf(b).y || gridOf(a).x - gridOf(b).x,
  );
  const placed: DashboardWidget[] = [];

  for (const w of sorted) {
    const g = gridOf(w);
    let bestY = 0;
    outer: for (let tryY = 0; tryY <= g.y; tryY += 1) {
      const candidate = { x: g.x, y: tryY, w: g.w, h: g.h };
      for (const p of placed) {
        if (overlaps(candidate, gridOf(p))) continue outer;
      }
      bestY = tryY;
      break;
    }
    placed.push({ ...w, grid: { ...g, y: bestY } });
  }

  return placed;
}

export function packDashboardWidgets(
  widgets: DashboardWidget[],
  columns = 12,
): DashboardWidget[] {
  if (!needsDashboardReflow(widgets, columns)) {
    return compactDashboardVertical(widgets, columns);
  }
  return compactDashboardVertical(reflowDashboardWidgets(widgets, columns), columns);
}

export function layoutFromWidgets(widgets: DashboardWidget[]): GridLayoutItem[] {
  return widgets.map(w => ({
    i: w.id,
    x: gridOf(w).x,
    y: gridOf(w).y,
    w: gridOf(w).w,
    h: gridOf(w).h,
    minW: 2,
    minH: 2
  }));
}

export function widgetsFromLayout(
  widgets: DashboardWidget[],
  layout: GridLayoutItem[],
): DashboardWidget[] {
  const byId = new Map(layout.map(l => [l.i, l]));
  return widgets.map(w => {
    const l = byId.get(w.id);
    if (!l) return w;
    return {
      ...w,
      grid: { x: l.x, y: l.y, w: l.w, h: l.h }
    };
  });
}

export function nextWidgetPosition(
  widgets: DashboardWidget[],
  width: number,
  height: number,
  columns = 12,
): { x: number; y: number } {
  if (widgets.length === 0) return { x: 0, y: 0 };

  const packed = packDashboardWidgets(widgets, columns);
  const last = packed[packed.length - 1];
  const g = gridOf(last);
  const x = g.x + g.w;
  const y = g.y;

  if (x + width > columns) {
    const maxY = packed.reduce((m, w) => Math.max(m, gridOf(w).y + gridOf(w).h), 0);
    return { x: 0, y: maxY };
  }
  return { x, y };
}

export function layoutsEqual(
  a: DashboardWidget[],
  b: DashboardWidget[],
): boolean {
  if (a.length !== b.length) return false;
  const byId = new Map(b.map(w => [w.id, w]));
  for (const w of a) {
    const other = byId.get(w.id);
    if (!other) return false;
    const ga = gridOf(w);
    const gb = gridOf(other);
    if (ga.x !== gb.x || ga.y !== gb.y || ga.w !== gb.w || ga.h !== gb.h) {
      return false;
    }
  }
  return true;
}
