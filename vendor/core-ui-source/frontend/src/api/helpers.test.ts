import { describe, it, expect, vi } from 'vitest';
import {
  toArr,
  unwrapResource,
  formatApiErrorDetail,
  errorMessageFromAxios,
  agentiveErrorMessage,
  entrySaveErrorMessage,
  slugifyEntryTypeKey,
} from './helpers';

describe('slugifyEntryTypeKey', () => {
  it('matches manifest entry_type_keys style', () => {
    expect(slugifyEntryTypeKey('QB Invoice')).toBe('qb_invoice');
    expect(slugifyEntryTypeKey('qb_invoice')).toBe('qb_invoice');
    expect(slugifyEntryTypeKey('Deal')).toBe('deal');
  });
});

describe('toArr', () => {
  it('returns workspaces array', () => {
    expect(toArr({ workspaces: [{ id: '1' }] })).toEqual([{ id: '1' }]);
  });
  it('returns apps array', () => {
    expect(toArr({ apps: [1, 2] })).toEqual([1, 2]);
  });
  it('returns empty for unknown', () => {
    expect(toArr({})).toEqual([]);
  });
});

describe('unwrapResource', () => {
  it('unwraps keyed resource', () => {
    expect(unwrapResource({ user: { id: 'x' } }, 'user')).toEqual({ id: 'x' });
  });
});

describe('formatApiErrorDetail', () => {
  it('joins Pydantic validation array messages', () => {
    expect(
      formatApiErrorDetail(
        [
          { type: 'missing', loc: ['body', 'file'], msg: 'Field required', input: {} },
        ],
        'fallback'
      )
    ).toBe('Field required');
  });

  it('uses fallback for empty array', () => {
    expect(formatApiErrorDetail([], 'nope')).toBe('nope');
  });
});

describe('entrySaveErrorMessage', () => {
  it('prefers API envelope message over axios Error.message', () => {
    const err = Object.assign(new Error('Request failed with status code 400'), {
      response: {
        data: {
          error_code: 'bad_request',
          message: "Field 'emergency_contact_phone' must be a valid phone number",
        },
      },
    });
    expect(entrySaveErrorMessage(err, 'Failed to submit entry')).toBe(
      "Field 'emergency_contact_phone' must be a valid phone number",
    );
  });
});

describe('errorMessageFromAxios', () => {
  it('reads detail from axios-shaped error', () => {
    expect(
      errorMessageFromAxios(
        { response: { data: { detail: [{ msg: 'bad' }] } } },
        'fallback'
      )
    ).toBe('bad');
  });

  it('reads the canonical API message when detail is absent', () => {
    expect(
      errorMessageFromAxios(
        { response: { data: { message: 'Access denied' } } },
        'fallback'
      )
    ).toBe('Access denied');
  });
});

describe('agentiveErrorMessage', () => {
  it('returns canonical envelope.message when present', () => {
    const err = {
      response: {
        data: {
          error_code: 'agentive.auth.signature_required',
          message: 'Authentication required — please reload.',
          details: null,
          timestamp: '2026-05-06T12:00:00+00:00',
          path: '/api/agentive/chat/message',
        },
      },
    };
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const r = agentiveErrorMessage(err, 'fallback');
    expect(r).toBe('Authentication required — please reload.');
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('agentive.auth.signature_required'),
    );
    warnSpy.mockRestore();
  });

  it('falls back to errorMessageFromAxios for legacy {detail} shape', () => {
    const err = {
      response: {
        data: {
          detail: 'Legacy error detail',
        },
      },
    };
    const r = agentiveErrorMessage(err, 'fallback');
    expect(r).toBe('Legacy error detail');
  });

  it('returns fallback when no recognizable shape', () => {
    const err = { unrelated: true };
    expect(agentiveErrorMessage(err, 'fallback')).toBe('fallback');
  });
});
