import { Activity } from 'lucide-react';

import { ProcessingStatusWidget } from '../../components/views/ProcessingStatusWidget';
import type { WidgetRegistration } from '../types';

const manifest: WidgetRegistration = {
  type: 'region-system/processing-status',
  component: ProcessingStatusWidget,
  meta: {
    label: 'Processing Status',
    icon: Activity,
    description: 'Progress, stages and retry for a record that background work is acting on',
  },
  source: 'plugin',
  scope: 'entry',
};

export default manifest;
