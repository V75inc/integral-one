import { lazy } from 'react';
const RecordCollectionWidget = lazy(() =>
  import('../../components/views/RecordCollectionWidget').then((module) => ({ default: module.RecordCollectionWidget })),
);
import { Rows } from 'lucide-react';
import type { WidgetRegistration } from '../types';

const manifest: WidgetRegistration = {
  type: 'operations-ui/record-collection',
  component: RecordCollectionWidget,
  meta: { label: 'Record Collection', icon: Rows, description: 'Configurable related records as tables or responsive cards' },
  source: 'plugin',
  scope: 'entry',
};

export default manifest;
