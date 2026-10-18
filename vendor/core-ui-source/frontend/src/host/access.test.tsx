import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { HostAccessPage } from './access';

vi.mock('../context/AuthContext', () => ({ useAuth: () => ({ user: null }) }));
afterEach(cleanup);

it('uses a neutral host fallback without acquiring session authority', () => {
  render(<MemoryRouter><HostAccessPage /></MemoryRouter>);
  expect(screen.getByText(/client configured for this installation/)).toBeInTheDocument();
  expect(screen.queryByRole('button')).not.toBeInTheDocument();
});
