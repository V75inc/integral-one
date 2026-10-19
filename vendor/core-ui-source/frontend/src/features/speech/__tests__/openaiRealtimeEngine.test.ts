import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { SpeechSessionResponse } from '../../../api/speech';
import { openaiRealtimeEngine } from '../engines/openaiRealtimeEngine';
import type { SttEvent } from '../engines/types';

class FakeChannel {
  readyState = 'open';
  send = vi.fn();
  close = vi.fn();
  onopen: (() => void) | null = null;
  onmessage: ((message: { data: string }) => void) | null = null;
  deliver(event: object) {
    this.onmessage?.({ data: JSON.stringify(event) });
  }
}

class FakePeerConnection {
  static last: FakePeerConnection;
  channel = new FakeChannel();
  sender = { replaceTrack: vi.fn(async () => undefined) };
  connectionState = 'new';
  onconnectionstatechange: (() => void) | null = null;
  addTrack = vi.fn(() => this.sender);
  createDataChannel = vi.fn(() => this.channel);
  createOffer = vi.fn(async () => ({ type: 'offer', sdp: 'v=0 offer' }));
  setLocalDescription = vi.fn(async () => undefined);
  setRemoteDescription = vi.fn(async () => undefined);
  close = vi.fn();
  constructor() {
    FakePeerConnection.last = this;
  }
}

const track = { stop: vi.fn() };
const stream = { getAudioTracks: () => [track] } as unknown as MediaStream;
const session: SpeechSessionResponse = {
  engine: 'openai-realtime',
  transport: 'webrtc',
  connect_url: 'https://api.openai.com/v1/realtime/calls',
  client_secret: 'ek_test',
  expires_at: '2030-01-01T00:00:00Z',
  params: {},
  max_session_seconds: 300,
};

describe('openaiRealtimeEngine', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    track.stop.mockClear();
    vi.stubGlobal('RTCPeerConnection', FakePeerConnection);
    fetchMock = vi.fn(async () => ({ ok: true, status: 200, text: async () => 'v=0 answer' }));
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('exchanges SDP with the short-lived client secret', async () => {
    await openaiRealtimeEngine.start({ stream, session });
    expect(fetchMock).toHaveBeenCalledWith(session.connect_url, {
      method: 'POST',
      headers: { Authorization: 'Bearer ek_test', 'Content-Type': 'application/sdp' },
      body: 'v=0 offer',
    });
    expect(FakePeerConnection.last.setRemoteDescription).toHaveBeenCalledWith({
      type: 'answer',
      sdp: 'v=0 answer',
    });
    expect(FakePeerConnection.last.createDataChannel).toHaveBeenCalledWith('oai-events');
  });

  it('turns deltas into interim text and completions into finals', async () => {
    const stt = await openaiRealtimeEngine.start({ stream, session });
    const events: SttEvent[] = [];
    stt.on(event => events.push(event));
    const channel = FakePeerConnection.last.channel;

    channel.deliver({ type: 'input_audio_buffer.speech_started', item_id: 'a' });
    channel.deliver({ type: 'conversation.item.input_audio_transcription.delta', item_id: 'a', delta: 'hel' });
    channel.deliver({ type: 'conversation.item.input_audio_transcription.delta', item_id: 'a', delta: 'lo' });
    channel.deliver({
      type: 'conversation.item.input_audio_transcription.completed',
      item_id: 'a',
      transcript: 'Hello.',
    });

    expect(events).toEqual([
      { type: 'speech-start' },
      { type: 'interim', text: 'hel' },
      { type: 'interim', text: 'hello' },
      { type: 'final', text: 'Hello.' },
      { type: 'interim', text: '' },
    ]);
  });

  it('flushes the utterance in progress on stop and leaves the mic alone', async () => {
    const stt = await openaiRealtimeEngine.start({ stream, session });
    const events: SttEvent[] = [];
    stt.on(event => events.push(event));
    const pc = FakePeerConnection.last;

    pc.channel.deliver({ type: 'input_audio_buffer.speech_started', item_id: 'a' });
    const stopping = stt.stop();
    expect(pc.channel.send).toHaveBeenCalledWith(
      JSON.stringify({ type: 'input_audio_buffer.commit' }),
    );
    pc.channel.deliver({
      type: 'conversation.item.input_audio_transcription.completed',
      item_id: 'a',
      transcript: 'Done',
    });
    await stopping;

    expect(pc.sender.replaceTrack).toHaveBeenCalledWith(null);
    expect(events).toContainEqual({ type: 'final', text: 'Done' });
    expect(events[events.length - 1]).toEqual({ type: 'end', reason: 'stopped' });
    expect(pc.close).toHaveBeenCalled();
    expect(track.stop).not.toHaveBeenCalled();
  });

  it('flushes on stop without VAD, where no speech_started ever arrives', async () => {
    // gpt-live-transcribe has no server-side turn detection, so the provider
    // sends no speech_started/speech_stopped. Gating the commit on `speaking`
    // (which only those events set) silently dropped the final utterance.
    const noVad = { ...session, params: { turn_detection: false } };
    const stt = await openaiRealtimeEngine.start({ stream, session: noVad });
    const events: SttEvent[] = [];
    stt.on(event => events.push(event));
    const pc = FakePeerConnection.last;

    pc.channel.deliver({
      type: 'conversation.item.input_audio_transcription.delta',
      item_id: 'a',
      delta: 'tail',
    });
    const stopping = stt.stop();
    expect(pc.channel.send).toHaveBeenCalledWith(
      JSON.stringify({ type: 'input_audio_buffer.commit' }),
    );

    // The delta alone must have registered the utterance as in flight, or
    // stop() would not have waited for this completion.
    pc.channel.deliver({
      type: 'conversation.item.input_audio_transcription.completed',
      item_id: 'a',
      transcript: 'tail end',
    });
    await stopping;
    expect(events).toContainEqual({ type: 'final', text: 'tail end' });
    expect(events[events.length - 1]).toEqual({ type: 'end', reason: 'stopped' });
  });

  it('does not commit on stop when VAD is on and nothing is in flight', async () => {
    // The VAD path is unchanged: an absent flag still means server VAD.
    const stt = await openaiRealtimeEngine.start({ stream, session });
    const pc = FakePeerConnection.last;
    await stt.stop();
    expect(pc.channel.send).not.toHaveBeenCalled();
  });

  it('rejects when the provider refuses the session', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 401, text: async () => '' });
    await expect(openaiRealtimeEngine.start({ stream, session })).rejects.toMatchObject({
      code: 'provider-auth',
    });
    expect(FakePeerConnection.last.close).toHaveBeenCalled();
  });

  it('needs a server session', async () => {
    await expect(openaiRealtimeEngine.start({ stream })).rejects.toMatchObject({
      code: 'not-configured',
    });
  });
});
