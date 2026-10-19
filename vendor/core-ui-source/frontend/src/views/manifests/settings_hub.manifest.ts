import { lazy } from 'react';
const SettingsHubWidget = lazy(() =>
  import('../../components/views/SettingsHubWidget').then((module) => ({ default: module.SettingsHubWidget })),
);
import { Settings2 } from 'lucide-react';
import type { WidgetRegistration } from '../types';

const manifest: WidgetRegistration = {
  type: 'operations-ui/settings-hub',
  component: SettingsHubWidget,
  meta: { label: 'Settings Hub', icon: Settings2, description: 'Grouped settings with inline controls' },
  source: 'plugin',
  scope: 'track',
};

export default manifest;
