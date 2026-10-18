import { lazy } from 'react';
const ComposableBoard = lazy(() =>
  import('../../components/views/composable/ComposableBoard').then((module) => ({ default: module.ComposableBoard })),
);
import { LayoutGrid } from 'lucide-react';

import type { WidgetRegistration } from '../types';

const manifest: WidgetRegistration = {
  type: 'composable_board',
  component: ComposableBoard,
  meta: {
    label: 'Composable board',
    icon: LayoutGrid,
    description:
      'Kanban-style board driven by group_by / color_by / swimlanes / sort_within_column.',
  },
  source: 'builtin',
};

export default manifest;

