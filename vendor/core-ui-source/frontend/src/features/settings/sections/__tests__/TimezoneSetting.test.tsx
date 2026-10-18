import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TimezoneSetting } from '../TimezoneSetting';
import { userTimezoneApi } from '../../../../api/userTimezone';
import { formatUserDateTime } from '../../../../utils/userTimezone';

const mocks = vi.hoisted(() => ({ refresh: vi.fn(), toast: vi.fn() }));
vi.mock('../../../../context/AuthContext', () => ({ useAuth: () => ({ user: { timezone: 'America/Guyana' }, refreshUser: mocks.refresh }) }));
vi.mock('../../../../context/ToastContext', () => ({ useToast: () => ({ showToast: mocks.toast }) }));
vi.mock('../../../../api/userTimezone', () => ({ userTimezoneApi: { set: vi.fn() } }));

beforeEach(() => { vi.mocked(userTimezoneApi.set).mockResolvedValue({ timezone: 'Asia/Tokyo', configured: true }); });
afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe('Account time zone', () => {
  it('loads the saved zone and saves an explicit choice', async () => {
    render(<TimezoneSetting />);
    expect(screen.getByLabelText('Account time zone')).toHaveValue('America/Guyana');
    expect(screen.getByRole('button', { name: 'Save time zone' })).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Account time zone'), { target: { value: 'Asia/Tokyo' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save time zone' }));
    await waitFor(() => expect(mocks.refresh).toHaveBeenCalled());
    expect(userTimezoneApi.set).toHaveBeenCalledWith('Asia/Tokyo');
    expect(mocks.toast).toHaveBeenCalledWith('Time zone saved.', 'success');
  });
  it('shows a save failure and allows retry', async () => {
    vi.mocked(userTimezoneApi.set).mockRejectedValueOnce(new Error('offline'));
    render(<TimezoneSetting />);
    fireEvent.change(screen.getByLabelText('Account time zone'), { target: { value: 'Asia/Tokyo' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save time zone' }));
    await waitFor(() => expect(mocks.toast).toHaveBeenCalledWith('Could not save time zone.', 'error'));
    expect(mocks.refresh).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Save time zone' }));
    await waitFor(() => expect(mocks.refresh).toHaveBeenCalled());
  });
  it('formats timestamps in the account zone rather than the device zone', () => {
    expect(formatUserDateTime('2026-01-15T00:30:00Z', 'America/Guyana')).toContain('Jan 14');
    expect(formatUserDateTime('2026-01-15T00:30:00Z', 'Asia/Tokyo')).toContain('Jan 15');
  });
});
