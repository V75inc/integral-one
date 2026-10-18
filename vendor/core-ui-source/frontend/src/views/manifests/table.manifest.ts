import { lazy } from 'react';
const TableWidget = lazy(() =>
  import('../../components/views/TableWidget').then((module) => ({ default: module.TableWidget })),
);
import { Table as TableIcon } from 'lucide-react';

import type { WidgetRegistration } from '../types';

const manifest: WidgetRegistration = {
  type: 'table',
  component: TableWidget,
  meta: {
    label: 'Table',
    icon: TableIcon,
    description: 'Spreadsheet-like data view with sort and column controls',
  },
};

export default manifest;

