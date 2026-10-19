import { lazy } from 'react';
const ActionBarWidget = lazy(() =>
  import('../../components/views/ActionBarWidget').then((module) => ({ default: module.ActionBarWidget })),
);
import { Zap } from 'lucide-react';

import type { WidgetRegistration } from '../types';

const manifest: WidgetRegistration = {
  type: 'action_bar',
  component: ActionBarWidget,
  meta: {
    label: 'Action Bar',
    icon: Zap,
    description: 'Row of buttons that invoke workspace tools against the current entry',
  },
  source: 'plugin',
  scope: 'entry',
};

export default manifest;
