import { afterEach, describe, expect, it, vi } from 'vitest';
import { authApi } from './auth';
import apiClient from './client';
import { getHostSession } from '../host/session';

vi.mock('../host/session', () => ({ getHostSession: vi.fn() }));
afterEach(() => vi.restoreAllMocks());

function hostedProfile() {
  vi.mocked(getHostSession).mockReturnValue({
    identity: 'installation_owner',
    session: vi.fn(),
    profile: vi.fn().mockResolvedValue({ name: 'Account Name', email: 'account@example.com' }),
  });
}

describe('canonical local display name', () => {
  it.each(['Owner', '', 'Local Name'])('retains the saved local name %j instead of masking it with the host account', async name => {
    hostedProfile();
    vi.spyOn(apiClient, 'get').mockResolvedValue({ data: { user: { id: 'local-owner', display_name: name } } });
    const user = await authApi.me();
    expect(user.display_name).toBe(name);
    expect(user.email).toBe('account@example.com');
  });

  it('reads the same saved profile after editing and refreshing', async () => {
    hostedProfile();
    const get = vi.spyOn(apiClient, 'get')
      .mockResolvedValueOnce({ data: { user: { id: 'local-owner', display_name: 'Owner' } } })
      .mockResolvedValueOnce({ data: { user: { id: 'local-owner', display_name: 'Chosen Local Name' } } });
    const put = vi.spyOn(apiClient, 'put').mockResolvedValue({ data: { user: { id: 'local-owner', display_name: 'Chosen Local Name' } } });
    expect((await authApi.me()).display_name).toBe('Owner');
    expect((await authApi.updateProfile({ display_name: 'Chosen Local Name' })).display_name).toBe('Chosen Local Name');
    expect((await authApi.me()).display_name).toBe('Chosen Local Name');
    expect(put).toHaveBeenCalledWith('/auth/update-profile', { display_name: 'Chosen Local Name' });
    expect(get).toHaveBeenCalledTimes(2);
  });

  it('uses the saved Core profile without a desktop host', async () => {
    vi.mocked(getHostSession).mockReturnValue(null);
    vi.spyOn(apiClient, 'get').mockResolvedValue({ data: { user: { id: 'server-user', display_name: 'Server Name' } } });
    expect((await authApi.me()).display_name).toBe('Server Name');
  });
});
