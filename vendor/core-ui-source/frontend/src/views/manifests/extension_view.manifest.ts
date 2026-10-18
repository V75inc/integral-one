import { lazy } from 'react';
const ExtensionViewWidget = lazy(() =>
  import('../../components/views/ExtensionViewWidget').then((module) => ({ default: module.ExtensionViewWidget })),
);
import { AppWindow } from 'lucide-react';
import type { WidgetRegistration } from '../types';

const manifest: WidgetRegistration = {
  type: 'extension_view',
  component: ExtensionViewWidget,
  meta: {
    label: 'App extension',
    icon: AppWindow,
    description: 'Sandboxed iframe view from an installed app package',
  },
  scope: 'both',
  source: 'builtin',
};

export default manifest;
