import { afterEach, expect, it, vi } from 'vitest';
import { getHostSession } from './session';

afterEach(() => { delete window.integralDesktop; });

it('provides no native authority in an ordinary browser', () => {
  expect(getHostSession()).toBeNull();
});

it('forwards the existing bridge without changing identity or offline behavior', async () => {
  const session = vi.fn().mockResolvedValue({ access_token: 'synthetic' });
  const resumeOffline = vi.fn().mockResolvedValue(undefined);
  const signOut = vi.fn().mockResolvedValue(undefined);
  const profile = vi.fn().mockResolvedValue({email: 'qa@example.test', name: 'QA'});
  window.integralDesktop = { session, resumeOffline, signOut, profile };
  const host = getHostSession()!;
  expect(host.identity).toBe('installation_owner');
  expect(await host.session()).toEqual({ access_token: 'synthetic' });
  expect(await host.profile!()).toEqual({email: 'qa@example.test', name: 'QA'});
  await host.resumeOffline!();
  await host.signOut!();
  expect(resumeOffline).toHaveBeenCalledOnce();
  expect(signOut).toHaveBeenCalledOnce();
});
