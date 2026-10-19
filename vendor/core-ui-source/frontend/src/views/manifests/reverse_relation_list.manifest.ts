import { lazy } from 'react';
const ReverseRelationListWidget = lazy(() =>
  import('../../components/views/ReverseRelationListWidget').then((module) => ({ default: module.ReverseRelationListWidget })),
);
import { Link2 } from 'lucide-react';

import type { WidgetRegistration } from '../types';

const manifest: WidgetRegistration = {
  type: 'reverse_relation_list',
  component: ReverseRelationListWidget,
  meta: {
    label: 'Related Records',
    icon: Link2,
    description:
      'Read-only list of entries elsewhere that reference this entry via a relation field',
  },
  source: 'plugin',
  scope: 'entry',
};

export default manifest;
