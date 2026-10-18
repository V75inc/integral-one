import { TableProperties } from 'lucide-react';

import { EditableRelatedLinesWidget } from '../../components/views/EditableRelatedLinesWidget';
import type { WidgetRegistration } from '../types';

const manifest: WidgetRegistration = {
  type: 'region-system/editable-related-lines',
  component: EditableRelatedLinesWidget,
  meta: {
    label: 'Editable Related Lines',
    icon: TableProperties,
    description:
      'Editable reverse-relation line grid with compose draft staging and priced rollups',
  },
  source: 'plugin',
  scope: 'entry',
};

export default manifest;
