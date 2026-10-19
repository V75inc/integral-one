import { describe, expect, it } from 'vitest';
import {
  isSingleColumnStack,
  needsDashboardReflow,
  packDashboardWidgets,
  reflowDashboardWidgets,
} from '../dashboardLayout';
import type { DashboardWidget } from '../../../api/dashboards';

function w(
  id: string,
  x: number,
  y: number,
  gw = 4,
  gh = 3,
): DashboardWidget {
  return {
    id,
    type: 'metric_card',
    title: id,
    grid: { x, y, w: gw, h: gh },
    config: {},
    data_source: {},
  };
}

describe('dashboardLayout', () => {
  it('detects single-column stacks', () => {
    expect(isSingleColumnStack([w('a', 0, 0), w('b', 0, 4)])).toBe(true);
    expect(isSingleColumnStack([w('a', 0, 0), w('b', 4, 0)])).toBe(false);
  });

  it('reflows stacked widgets into rows', () => {
    const input = [
      w('a', 0, 0, 4, 2),
      w('b', 0, 2, 4, 2),
      w('c', 0, 4, 4, 4),
    ];
    const out = reflowDashboardWidgets(input, 12);
    expect(out[0].grid).toMatchObject({ x: 0, y: 0 });
    expect(out[1].grid).toMatchObject({ x: 4, y: 0 });
    expect(out[2].grid).toMatchObject({ x: 8, y: 0 });
  });

  it('packs agent-style single column layouts', () => {
    const input = [
      w('a', 0, 0, 12, 2),
      w('b', 0, 2, 6, 4),
      w('c', 0, 6, 6, 4),
    ];
    expect(needsDashboardReflow(input)).toBe(true);
    const out = packDashboardWidgets(input, 12);
    expect(out[1].grid.x).toBe(0);
    expect(out[2].grid.x).toBe(6);
    expect(out[1].grid.y).toBe(out[2].grid.y);
  });
});
