import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, Link } from 'react-router-dom';
import { waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { AuthPageLayout } from '../AuthPageLayout';

describe('AuthPageLayout', () => {
  it('preserves the frameless outline and auth navigation between routes', async () => {
    render(
      <MemoryRouter initialEntries={['/login']}>
        <Routes>
          <Route
            path="/login"
            element={
              <AuthPageLayout title="Sign in" description="Welcome back.">
                <Link to="/signup">Create an account</Link>
              </AuthPageLayout>
            }
          />
          <Route
            path="/signup"
            element={
              <AuthPageLayout title="Create an account" description="Join us.">
                <Link to="/login">Sign in</Link>
              </AuthPageLayout>
            }
          />
        </Routes>
      </MemoryRouter>,
    );

    const initialRipple = screen
      .getByRole('heading', { name: 'Sign in' })
      .closest('main')
      ?.querySelector('svg.auth-ripple');
    expect(initialRipple).toBeInTheDocument();
    fireEvent.click(screen.getByRole('link', { name: 'Create an account' }));

    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'Create an account' })).toBeInTheDocument(),
    );
    const nextRipple = screen
      .getByRole('heading', { name: 'Create an account' })
      .closest('main')
      ?.querySelector('svg.auth-ripple');
    expect(nextRipple).toBeInTheDocument();
    expect(nextRipple?.querySelectorAll('path')).toHaveLength(2);
    expect(nextRipple?.querySelector('rect')).toBeNull();
  });
});
