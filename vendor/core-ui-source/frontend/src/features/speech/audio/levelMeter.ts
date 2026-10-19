/**
 * Microphone level (0..1) from a MediaStream, sampled on a timer.
 *
 * Engine-agnostic on purpose: the same reading drives the composer's level
 * meter and silence auto-stop, whichever recognizer is transcribing.
 */

/** Scaled level above which we count the user as speaking. */
export const SPEAKING_LEVEL = 0.06;

export interface LevelMeter {
  stop(): void;
}

export function startLevelMeter(
  stream: MediaStream,
  onLevel: (level: number) => void,
  intervalMs = 50,
): LevelMeter {
  const Ctx =
    typeof window === 'undefined'
      ? undefined
      : (window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext);
  if (!Ctx) return { stop() {} };

  const ctx = new Ctx();
  // Safari can create the context suspended after an awaited permission prompt.
  void ctx.resume?.().catch(() => undefined);
  const source = ctx.createMediaStreamSource(stream);
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 1024;
  source.connect(analyser);
  const samples = new Float32Array(analyser.fftSize);

  const timer = setInterval(() => {
    analyser.getFloatTimeDomainData(samples);
    let sum = 0;
    for (let i = 0; i < samples.length; i += 1) sum += samples[i] * samples[i];
    const rms = Math.sqrt(sum / samples.length);
    // Speech RMS sits around 0.02–0.2; scale so conversation fills the meter.
    onLevel(Math.min(1, rms * 4));
  }, intervalMs);

  return {
    stop() {
      clearInterval(timer);
      try {
        source.disconnect();
      } catch {
        // already disconnected
      }
      void ctx.close().catch(() => undefined);
    },
  };
}
