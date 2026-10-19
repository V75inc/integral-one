import { lazy } from 'react';
const ReportCenterWidget = lazy(() =>
  import('../../components/views/ReportCenterWidget').then((module) => ({ default: module.ReportCenterWidget })),
);
import { FileBarChart } from 'lucide-react';
import type { WidgetRegistration } from '../types';

const manifest: WidgetRegistration = {
  type: 'operations-ui/report-center',
  component: ReportCenterWidget,
  meta: { label: 'Report Center', icon: FileBarChart, description: 'Configurable operational reports with metrics' },
  source: 'plugin',
  scope: 'track',
};

export default manifest;
