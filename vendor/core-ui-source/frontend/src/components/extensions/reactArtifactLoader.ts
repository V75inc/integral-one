import type {ComponentType} from 'react';
const modules = new Map<string, Promise<Record<string, ComponentType<Record<string, unknown>>>>>();
export function loadReactArtifact(url: string) {
  const resolved = new URL(url, location.origin);
  if (resolved.origin !== location.origin || !/^\/api\/ui-artifacts\/[a-z][a-z0-9-]*\/[0-9a-f]{64}\/index\.mjs$/.test(resolved.pathname) || resolved.search || resolved.hash) throw new Error('Invalid UI artifact URL.');
  let task = modules.get(resolved.href);
  if (!task) {
    task = import(/* @vite-ignore */ resolved.href).catch(error => { modules.delete(resolved.href); throw error; });
    modules.set(resolved.href, task!);
  }
  return task!;
}
