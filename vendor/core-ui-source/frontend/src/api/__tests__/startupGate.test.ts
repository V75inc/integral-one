import { beforeEach, describe, expect, it } from 'vitest';
import { _resetStartupGateForTests, isDeferrableStartupGet } from '../startupGate';

describe('startup gate', () => {
  beforeEach(() => _resetStartupGateForTests(false));

  it('defers only the background panel GETs during the startup window', () => {
    expect(isDeferrableStartupGet('get', '/chat/threads?include_archived=false')).toBe(true);
    expect(isDeferrableStartupGet('GET', '/approvals?status=pending')).toBe(true);
    expect(isDeferrableStartupGet(undefined, '/notifications')).toBe(true);
    expect(isDeferrableStartupGet('get', '/agentive/speech/config')).toBe(true);
    expect(isDeferrableStartupGet('get', '/users/me/ai-configuration')).toBe(true);
    expect(isDeferrableStartupGet('get', '/agentive/staging/pending')).toBe(true);
    expect(isDeferrableStartupGet('get', '/api/chat/threads')).toBe(true);
  });

  it('never defers page data, writes or other thread routes', () => {
    expect(isDeferrableStartupGet('get', '/apps/n.WorkspaceApp.x/tracks')).toBe(false);
    expect(isDeferrableStartupGet('get', '/tracks/n.Track.x/detail')).toBe(false);
    expect(isDeferrableStartupGet('get', '/chat/threads/abc')).toBe(false);
    expect(isDeferrableStartupGet('post', '/chat/threads')).toBe(false);
    expect(isDeferrableStartupGet('post', '/approvals')).toBe(false);
  });

  it('defers nothing once the window has closed', () => {
    _resetStartupGateForTests(true);
    expect(isDeferrableStartupGet('get', '/chat/threads')).toBe(false);
  });
});
