import type { WidgetRegistration } from '../types';
import { registerWidget } from '../registry';

type ManifestModule = {
  default?: WidgetRegistration | WidgetRegistration[];
};

let _loaded = false;

export function registerDiscoveredWidgets(): void {
  if (_loaded) return;
  _loaded = true;

  const modules = import.meta.glob<ManifestModule>('./**/*.manifest.ts', {
    eager: true,
  });

  for (const mod of Object.values(modules)) {
    const payload = mod.default;
    if (!payload) continue;
    if (Array.isArray(payload)) {
      for (const reg of payload) registerWidget(reg);
      continue;
    }
    registerWidget(payload);
  }
}

