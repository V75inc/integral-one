import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the axios client used by the agentive module BEFORE importing the module under test.
vi.mock('./client', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
}));

import api from './client';
import {
  postAgentiveChatMessage,
  type ChatTurnRequest,
  type ChatTurnResponse,
  type AgentiveErrorEnvelope,
} from './agentive';

describe('postAgentiveChatMessage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('POSTs to /agentive/chat/message with ChatTurnRequest body', async () => {
    const req: ChatTurnRequest = {
      message: 'hello',
      session_id: 'sess-1',
    };
    const fakeResp: ChatTurnResponse = {
      ok: true,
      message: 'response',
      session_id: 'sess-1',
      agent_user_id: 'alice@example.com',
      agent_type: 'mcp',
    };
    (api.post as ReturnType<typeof vi.fn>).mockResolvedValue({ data: fakeResp });

    const r = await postAgentiveChatMessage(req);
    expect(api.post).toHaveBeenCalledWith('/agentive/chat/message', req);
    expect(r).toEqual(fakeResp);
    expect(r.agent_type).toBe('mcp');
  });

  it('parses ChatTurnResponse with all five required fields', async () => {
    const fakeResp: ChatTurnResponse = {
      ok: true,
      message: 'msg',
      session_id: 'sid',
      agent_user_id: 'uid',
      agent_type: 'integral_native',
    };
    (api.post as ReturnType<typeof vi.fn>).mockResolvedValue({ data: fakeResp });

    const r = await postAgentiveChatMessage({ message: 'hi' });
    expect(r.ok).toBe(true);
    expect(r.message).toBe('msg');
    expect(r.session_id).toBe('sid');
    expect(r.agent_user_id).toBe('uid');
    expect(r.agent_type).toBe('integral_native');
  });
});

describe('AgentiveErrorEnvelope shape', () => {
  it('matches the 5-key canonical shape', () => {
    const env: AgentiveErrorEnvelope = {
      error_code: 'VALIDATION_ERROR',
      message: 'Request body failed validation',
      details: [{ loc: ['body', 'message'], msg: 'field required' }],
      timestamp: '2026-05-06T12:00:00+00:00',
      path: '/api/agentive/chat/message',
    };
    // Compile-time check: all five fields are required.
    expect(Object.keys(env).sort()).toEqual([
      'details',
      'error_code',
      'message',
      'path',
      'timestamp',
    ]);
  });
});
