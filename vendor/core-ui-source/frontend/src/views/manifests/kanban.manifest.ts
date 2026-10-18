import { lazy } from 'react';
const KanbanWidget = lazy(() =>
  import('../../components/views/KanbanWidget').then((module) => ({ default: module.KanbanWidget })),
);
import { Columns } from 'lucide-react';

import type { WidgetRegistration } from '../types';

const manifest: WidgetRegistration = {
  type: 'kanban',
  component: KanbanWidget,
  meta: {
    label: 'Kanban Board',
    icon: Columns,
    description: 'Column-based workflow management with drag-and-drop',
  },
};

export default manifest;

