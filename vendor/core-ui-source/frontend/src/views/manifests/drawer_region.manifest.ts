import { lazy } from 'react';
const DrawerRegionWidget = lazy(() =>
  import('../../components/views/DrawerRegionWidget').then((module) => ({ default: module.DrawerRegionWidget })),
);
import { PanelRight } from 'lucide-react';

import type { WidgetRegistration } from '../types';

const manifest: WidgetRegistration = {
  type: 'drawer_region',
  component: DrawerRegionWidget,
  meta: {
    label: 'Drawer Region',
    icon: PanelRight,
    description: 'A button that opens a side panel instead of a centered modal dialog',
  },
  source: 'plugin',
  scope: 'entry',
};

export default manifest;
