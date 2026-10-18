import { registerDiscoveredWidgets } from './manifests/auto';

registerDiscoveredWidgets();

export {
  ViewRenderer,
  ViewSelector,
  getWidget,
  listWidgets,
  registerWidget,
  getEnabledWidgetTypes,
  getEnabledWidgetRegistrations,
  listWidgetCapabilities,
} from './registry';
export type {
  ViewWidgetProps,
  WidgetMeta,
  WidgetRegistration,
  WidgetCapabilityDescriptor,
} from './types';
