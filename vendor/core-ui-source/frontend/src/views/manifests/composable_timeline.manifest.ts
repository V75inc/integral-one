import { lazy } from 'react';
const ComposableTimeline = lazy(() =>
  import('../../components/views/composable/ComposableTimeline').then((module) => ({ default: module.ComposableTimeline })),
);
import { CalendarRange } from 'lucide-react';

import type { WidgetRegistration } from '../types';

const manifest: WidgetRegistration = {
  type: 'composable_timeline',
  component: ComposableTimeline,
  meta: {
    label: 'Composable timeline',
    icon: CalendarRange,
    description:
      'Vertical chronology grouped by month, driven by date_field / color_by / filter.',
  },
  source: 'builtin',
};

export default manifest;

