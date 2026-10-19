import { lazy } from 'react';
const SummaryTilesWidget = lazy(() =>
  import('../../components/views/SummaryTilesWidget').then((module) => ({ default: module.SummaryTilesWidget })),
);
import { Gauge } from 'lucide-react';

import type { WidgetRegistration } from '../types';

const manifest: WidgetRegistration = {
  type: 'summary_tiles',
  component: SummaryTilesWidget,
  meta: {
    label: 'Summary Tiles',
    icon: Gauge,
    description: 'Read-only KPI strip reading values off the bound entry',
  },
  source: 'plugin',
  scope: 'entry',
};

export default manifest;
