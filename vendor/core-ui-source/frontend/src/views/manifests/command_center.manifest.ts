import { lazy } from 'react';
const CommandCenterWidget = lazy(() =>
  import('../../components/views/CommandCenterWidget').then((module) => ({ default: module.CommandCenterWidget })),
);
import { LayoutDashboard } from 'lucide-react';
import type { WidgetRegistration } from '../types';

const manifest: WidgetRegistration = {
  type: 'operations-ui/command-center',
  component: CommandCenterWidget,
  meta: { label: 'Command Center', icon: LayoutDashboard, description: 'Configurable operational dashboard with metrics and child views' },
  source: 'plugin',
  scope: 'track',
};

export default manifest;
