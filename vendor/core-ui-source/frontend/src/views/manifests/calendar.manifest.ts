import { lazy } from 'react';
const CalendarWidget = lazy(() =>
  import('../../components/views/CalendarWidget').then((module) => ({ default: module.CalendarWidget })),
);
import { Calendar as CalendarIcon } from 'lucide-react';

import type { WidgetRegistration } from '../types';

const manifest: WidgetRegistration = {
  type: 'calendar',
  component: CalendarWidget,
  meta: {
    label: 'Calendar',
    icon: CalendarIcon,
    description: 'Time-based planning with month, week, and day views',
  },
};

export default manifest;

