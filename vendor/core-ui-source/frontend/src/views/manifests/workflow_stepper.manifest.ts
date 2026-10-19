import { lazy } from 'react';
const WorkflowStepperWidget = lazy(() =>
  import('../../components/views/WorkflowStepperWidget').then((module) => ({ default: module.WorkflowStepperWidget })),
);
import { ListChecks } from 'lucide-react';
import type { WidgetRegistration } from '../types';

const manifest: WidgetRegistration = { type: 'operations-ui/workflow-stepper', component: WorkflowStepperWidget, meta: { label: 'Workflow Stepper', icon: ListChecks, description: 'Visual status progression for an operational record' }, source: 'plugin', scope: 'both' };
export default manifest;
