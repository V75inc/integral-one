import apiClient from './client';

export interface UserTimezone {
  timezone: string;
  configured: boolean;
}

export const userTimezoneApi = {
  get: (): Promise<UserTimezone> =>
    apiClient.get('/users/me/timezone').then(r => r.data),
  set: (timezone: string, onlyIfUnset = false): Promise<UserTimezone> =>
    apiClient.patch('/users/me/timezone', { timezone, only_if_unset: onlyIfUnset }).then(r => r.data),
};
