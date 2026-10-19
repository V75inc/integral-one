import { lazy } from 'react';
const ComposableList = lazy(() =>
  import('../../components/views/composable/ComposableList').then((module) => ({ default: module.ComposableList })),
);
import { Layers } from 'lucide-react';

import type { WidgetRegistration } from '../types';

const manifest: WidgetRegistration = {
  type: 'composable_list',
  component: ComposableList,
  meta: {
    label: 'Composable list',
    icon: Layers,
    description:
      'Generic declarative list driven by group_by / sort / filter / projection / density.',
  },
  source: 'builtin',
};

export default manifest;

