import { beforeEach, describe, expect, it } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useActiveChatProvider } from './useActiveChatProvider';
import { useSettings } from '../settings/store';

beforeEach(() => localStorage.clear());

describe('native resident selection', () => {
  it('selects Integral AI on a fresh installation without probing environment availability', () => {
    const { result } = renderHook(() => { useSettings(); return useActiveChatProvider(); });
    expect(result.current.id).toBe('integral_native');
  });

  it.each([1, 2, 3])('migrates an explicit retired selection at schema version %s', schemaVersion => {
    localStorage.setItem('integral.settings.v1', JSON.stringify({schemaVersion, providers: {defaultProviderId: 'jvagent-embedded'}}));
    const { result } = renderHook(() => { useSettings(); return useActiveChatProvider(); });
    expect(result.current.id).toBe('integral_native');
    expect(JSON.parse(localStorage.getItem('integral.settings.v1')!).providers.defaultProviderId).toBe('pydantic-ai-native');
  });

  it.each(['mock-echo', 'unknown'])('normalizes saved route %s to native', savedRoute => {
    localStorage.setItem('integral.settings.v1', JSON.stringify({providers: {defaultProviderId: savedRoute}}));
    const { result } = renderHook(() => { useSettings(); return useActiveChatProvider(); });
    expect(result.current.id).toBe('integral_native');
  });
});
