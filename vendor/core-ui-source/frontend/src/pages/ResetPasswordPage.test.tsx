import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, expect, it, vi } from 'vitest';
import { authApi } from '../api/auth';
import { ActivateAccountPage, ResetPasswordPage } from './ResetPasswordPage';

vi.mock('../api/auth', async (importOriginal) => ({
  ...await importOriginal<typeof import('../api/auth')>(),
  authApi: { activateAccount: vi.fn(), resetPassword: vi.fn() },
}));
vi.mock('../context/ToastContext', () => ({
  useToast: () => ({ showToast: vi.fn() }),
}));

beforeEach(() => vi.clearAllMocks());

it.each([true, false])('submits the token only to its setup endpoint (activation=%s)', async (activation) => {
  vi.mocked(authApi.activateAccount).mockResolvedValue({ ok: true, message: 'Activated' });
  vi.mocked(authApi.resetPassword).mockResolvedValue({ ok: true, message: 'Reset' });
  render(<MemoryRouter initialEntries={['/setup?token=single-use-token']}>
    {activation ? <ActivateAccountPage /> : <ResetPasswordPage />}
  </MemoryRouter>);
  fireEvent.change(screen.getByLabelText('New password'), { target: { value: 'Strong-password-2026!' } });
  fireEvent.change(screen.getByLabelText('Confirm password'), { target: { value: 'Strong-password-2026!' } });
  fireEvent.click(screen.getByRole('button', { name: activation ? 'Activate account' : 'Set new password' }));
  await screen.findByText('Redirecting you to sign in…');
  const called = activation ? authApi.activateAccount : authApi.resetPassword;
  const unused = activation ? authApi.resetPassword : authApi.activateAccount;
  expect(called).toHaveBeenCalledWith('single-use-token', 'Strong-password-2026!');
  expect(unused).not.toHaveBeenCalled();
});

it('directs an expired activation link to the administrator and sign-in page', async () => {
  vi.mocked(authApi.activateAccount).mockRejectedValue({
    response: { data: { detail: { error_code: 'auth.reset.token_expired' } } },
  });
  render(<MemoryRouter initialEntries={['/activate-account?token=expired']}><ActivateAccountPage /></MemoryRouter>);
  fireEvent.change(screen.getByLabelText('New password'), { target: { value: 'Strong-password-2026!' } });
  fireEvent.change(screen.getByLabelText('Confirm password'), { target: { value: 'Strong-password-2026!' } });
  fireEvent.click(screen.getByRole('button', { name: 'Activate account' }));
  expect(await screen.findByText(/Contact your organization administrator for a new one/)).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Return to sign in' })).toHaveAttribute('href', '/login');
  expect(screen.queryByRole('link', { name: 'Request a new link' })).not.toBeInTheDocument();
});
