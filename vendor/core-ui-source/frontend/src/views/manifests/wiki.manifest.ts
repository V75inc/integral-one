import { lazy } from 'react';
const WikiWidget = lazy(() =>
  import('../../components/views/WikiWidget').then((module) => ({ default: module.WikiWidget })),
);
import { BookOpen } from 'lucide-react';

import type { WidgetRegistration } from '../types';

const manifest: WidgetRegistration = {
  type: 'wiki',
  component: WikiWidget,
  meta: {
    label: 'Wiki',
    icon: BookOpen,
    description: 'Hierarchical pages with sidebar tree and markdown reader',
  },
};

export default manifest;
