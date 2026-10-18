import { lazy } from 'react';
const LayoutContainerWidget = lazy(() =>
  import('../../components/views/LayoutContainerWidget').then((module) => ({ default: module.LayoutContainerWidget })),
);
import { Columns } from 'lucide-react';

import type { WidgetRegistration } from '../types';

const manifest: WidgetRegistration = {
  type: 'layout_container',
  component: LayoutContainerWidget,
  meta: {
    label: 'Layout Container',
    icon: Columns,
    description: 'Stack/tabs/accordion wrapper composing an ordered list of child regions',
  },
  source: 'plugin',
  scope: 'entry',
};

export default manifest;
