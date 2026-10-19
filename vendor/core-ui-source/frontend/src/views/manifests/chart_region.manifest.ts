import { lazy } from 'react';
const ChartRegionWidget = lazy(() =>
  import('../../components/views/ChartRegionWidget').then((module) => ({ default: module.ChartRegionWidget })),
);
import { BarChart3 } from 'lucide-react';

import type { WidgetRegistration } from '../types';

const manifest: WidgetRegistration = {
  type: 'chart_region',
  component: ChartRegionWidget,
  meta: {
    label: 'Chart',
    icon: BarChart3,
    description: 'Config-driven bar/line/pie/donut chart bound to self or aggregated over a track',
  },
  source: 'plugin',
  // Genuinely dual-placement — 'track' mode (aggregate) renders as an
  // ordinary track view/tab, 'self' mode (bound to the current entry)
  // renders from related_views[]. See the backend ViewTypeSpec's own
  // scope="both" comment (region_system/__init__.py) for the real-profile
  // usage that confirmed this.
  scope: 'both',
};

export default manifest;
