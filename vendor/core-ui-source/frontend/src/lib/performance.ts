/** Opt-in, content-free timings. Never sends data to an external endpoint. */
const enabled = () => import.meta.env.VITE_PERF_TRACE === '1';
const samples: { name: string; durationMs: number; count?: number; traceId: string }[] = [];
export interface Interaction { started: number; traceId: string; traceparent: string }
export function beginInteraction(): Interaction | undefined {
  if (!enabled()) return undefined;
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  const hex = Array.from(bytes, value => value.toString(16).padStart(2, '0')).join('');
  return { started: performance.now(), traceId: hex.slice(0, 32),
    traceparent: `00-${hex.slice(0, 32)}-${hex.slice(32)}-01` };
}
export function finishInteraction(interaction: Interaction | undefined, name: string, count?: number): void {
  if (!interaction) return;
  samples.push({ name, durationMs: performance.now() - interaction.started, count, traceId: interaction.traceId });
  if (samples.length > 200) samples.shift();
}
export function performanceSnapshot() { return samples.map(sample => ({ ...sample })); }

if (enabled() && typeof window !== 'undefined') {
  (window as Window & { __INTEGRAL_PERFORMANCE__?: { snapshot: typeof performanceSnapshot } })
    .__INTEGRAL_PERFORMANCE__ = { snapshot: performanceSnapshot };
}
