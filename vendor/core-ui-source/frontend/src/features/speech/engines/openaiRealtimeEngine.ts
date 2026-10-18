/**
 * OpenAI Realtime transcription over WebRTC.
 *
 * The backend mints a short-lived client secret for a transcription-only
 * session; this engine POSTs its SDP offer to the provider with that secret
 * and receives transcript events on the `oai-events` data channel. Audio goes
 * browser → OpenAI directly (Opus over WebRTC); the API key never reaches the
 * browser. CSP: `connect-src https://api.openai.com` covers the SDP fetch;
 * WebRTC media isn't governed by `connect-src`.
 */
import { createEmitter } from './emitter';
import { sttError, type SttEngine, type SttEndReason, type SttEvent } from './types';

const DRAIN_TIMEOUT_MS = 1500;

interface RealtimeEvent {
  type?: string;
  item_id?: string;
  delta?: string;
  transcript?: string;
  error?: { message?: string };
}

export const openaiRealtimeEngine: SttEngine = {
  id: 'openai-realtime',
  label: 'OpenAI',
  kind: 'remote',
  needsServerSession: true,
  isSupported: () => typeof RTCPeerConnection !== 'undefined',

  async start({ stream, session }) {
    if (!session) {
      throw sttError('not-configured', 'No speech-to-text session was provided.');
    }
    if (!stream) {
      throw sttError('no-device', 'No microphone was found.');
    }
    const track = stream.getAudioTracks()[0];
    if (!track) throw sttError('no-device', 'No microphone was found.');

    const emitter = createEmitter<SttEvent>();
    const pc = new RTCPeerConnection();
    const sender = pc.addTrack(track, stream);
    const dc = pc.createDataChannel('oai-events');

    // Whether the session has server-side voice-activity detection. Absent
    // means yes: every model that supports it, plus any session minted before
    // the flag existed. Only an explicit `false` selects the no-VAD path.
    // Without VAD the provider sends no `input_audio_buffer.speech_started` /
    // `speech_stopped`, so neither `speaking` nor `pending` can be driven by
    // them and this engine has to flush the buffer itself.
    const vad =
      (session.params as { turn_detection?: boolean } | undefined)
        ?.turn_detection !== false;

    // Per-utterance text, keyed by the provider's item id.
    const partial = new Map<string, string>();
    const pending = new Set<string>();
    let speaking = false;
    let stopping = false;
    let ended = false;
    let drained: (() => void) | null = null;

    const interimText = () => [...partial.values()].join(' ').trim();
    const checkDrained = () => {
      if (drained && pending.size === 0 && partial.size === 0) drained();
    };
    const finish = (reason: SttEndReason) => {
      if (ended) return;
      ended = true;
      try {
        dc.close();
      } catch {
        // already closed
      }
      // The caller owns the mic track; closing the connection must not stop it.
      pc.close();
      emitter.emit({ type: 'end', reason });
    };

    dc.onopen = () => emitter.emit({ type: 'ready' });
    dc.onmessage = message => {
      let event: RealtimeEvent;
      try {
        event = JSON.parse(String(message.data)) as RealtimeEvent;
      } catch {
        return;
      }
      const id = event.item_id ?? '';
      switch (event.type) {
        case 'input_audio_buffer.speech_started':
          speaking = true;
          if (id) pending.add(id);
          emitter.emit({ type: 'speech-start' });
          break;
        case 'input_audio_buffer.speech_stopped':
          speaking = false;
          break;
        case 'conversation.item.input_audio_transcription.delta':
          // With no VAD there is no speech_started to open the utterance, so
          // the first delta is what registers it as in flight — otherwise
          // stop() would not wait for it to drain. A Set makes this a no-op
          // when VAD already added the id.
          if (id) pending.add(id);
          partial.set(id, (partial.get(id) ?? '') + (event.delta ?? ''));
          emitter.emit({ type: 'interim', text: interimText() });
          break;
        case 'conversation.item.input_audio_transcription.completed': {
          partial.delete(id);
          pending.delete(id);
          const text = (event.transcript ?? '').trim();
          if (text) emitter.emit({ type: 'final', text });
          emitter.emit({ type: 'interim', text: interimText() });
          checkDrained();
          break;
        }
        case 'conversation.item.input_audio_transcription.failed':
          partial.delete(id);
          pending.delete(id);
          emitter.emit({ type: 'interim', text: interimText() });
          checkDrained();
          break;
        case 'error':
          // Errors while finalizing (e.g. committing an empty buffer) aren't
          // the user's problem.
          if (!stopping) {
            emitter.emit({
              type: 'error',
              error: sttError(
                'provider-unavailable',
                event.error?.message || 'Transcription failed.',
                true,
              ),
            });
          }
          break;
        default:
          break;
      }
    };
    pc.onconnectionstatechange = () => {
      if (ended || stopping) return;
      if (pc.connectionState === 'failed') {
        emitter.emit({
          type: 'error',
          error: sttError(
            'network',
            "Couldn't hold a connection to the speech service. Your network may block it — try browser recognition.",
            true,
          ),
        });
        finish('remote-closed');
      } else if (pc.connectionState === 'closed') {
        finish('remote-closed');
      }
    };

    try {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      let response: Response;
      try {
        response = await fetch(session.connect_url, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${session.client_secret}`,
            'Content-Type': 'application/sdp',
          },
          body: offer.sdp ?? '',
        });
      } catch (cause) {
        throw sttError('network', "Couldn't reach the speech service.", true, cause);
      }
      if (!response.ok) {
        const auth = response.status === 401 || response.status === 403;
        throw sttError(
          auth ? 'provider-auth' : 'provider-unavailable',
          auth
            ? 'The speech service rejected the session.'
            : `The speech service returned ${response.status}.`,
          response.status >= 500,
        );
      }
      await pc.setRemoteDescription({ type: 'answer', sdp: await response.text() });
    } catch (error) {
      ended = true;
      pc.close();
      throw error;
    }

    return {
      on: emitter.on,
      async stop() {
        if (ended) return;
        stopping = true;
        // Flush an utterance still in progress, then stop sending audio.
        // With VAD, `speaking` says whether there is anything to flush.
        // Without it there is no such signal, so always flush: committing an
        // empty buffer only yields an `error` event, which is already ignored
        // while stopping. Skipping the commit would drop the final utterance.
        if ((speaking || !vad) && dc.readyState === 'open') {
          try {
            dc.send(JSON.stringify({ type: 'input_audio_buffer.commit' }));
          } catch {
            // channel closing
          }
        }
        try {
          await sender.replaceTrack(null);
        } catch {
          // connection already closed
        }
        if (pending.size > 0 || partial.size > 0) {
          await new Promise<void>(resolve => {
            const timer = setTimeout(resolve, DRAIN_TIMEOUT_MS);
            drained = () => {
              clearTimeout(timer);
              resolve();
            };
          });
        }
        finish('stopped');
      },
      abort() {
        stopping = true;
        finish('aborted');
      },
    };
  },
};
