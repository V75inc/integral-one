/**
 * Speech engines by id. Built-ins load on first lookup; `registerSttEngine`
 * lets a plugin add one (a later registration with the same id wins, which
 * keeps HMR reloads harmless).
 */
import { openaiRealtimeEngine } from './openaiRealtimeEngine';
import type { SttEngine, SttEngineId } from './types';
import { webSpeechEngine } from './webSpeechEngine';

const BUILTIN_ENGINES: readonly SttEngine[] = [webSpeechEngine, openaiRealtimeEngine];

const engines = new Map<SttEngineId, SttEngine>();
let builtinsLoaded = false;

function ensureBuiltins(): void {
  if (builtinsLoaded) return;
  builtinsLoaded = true;
  for (const engine of BUILTIN_ENGINES) {
    if (!engines.has(engine.id)) engines.set(engine.id, engine);
  }
}

export function registerSttEngine(engine: SttEngine): void {
  ensureBuiltins();
  engines.set(engine.id, engine);
}

export function getSttEngine(id: SttEngineId): SttEngine | null {
  ensureBuiltins();
  return engines.get(id) ?? null;
}

export function listSttEngines(): SttEngine[] {
  ensureBuiltins();
  return [...engines.values()];
}

/** Test helper — forget registrations; built-ins reload on next lookup. */
export function resetSttEngines(): void {
  engines.clear();
  builtinsLoaded = false;
}
