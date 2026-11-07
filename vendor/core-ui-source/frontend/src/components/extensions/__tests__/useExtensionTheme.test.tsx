import { afterEach, describe, expect, it } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useExtensionTheme } from '../useExtensionTheme';

afterEach(() => {
  document.documentElement.classList.remove('theme-dark', 'dark');
});

describe('useExtensionTheme', () => {
  it('reports light by default', () => {
    expect(renderHook(() => useExtensionTheme()).result.current.colorScheme).toBe('light');
  });

  it('reports dark when Core sets its theme-dark class', () => {
    document.documentElement.classList.add('theme-dark');
    expect(renderHook(() => useExtensionTheme()).result.current.colorScheme).toBe('dark');
  });
});
