/**
 * MemberValue Vitest — read-only renderer for `member` field values.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, waitFor, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import '@testing-library/jest-dom/vitest';

import { MemberValue } from '../MemberValue';

vi.mock('../../../../context/ScopeContext', () => ({
  useScope: () => ({ scope: { workspaceId: 'ws-1' } }),
}));

vi.mock('../../../../api/members', () => ({
  lookupWorkspaceMemberById: vi.fn(),
}));

import { lookupWorkspaceMemberById } from '../../../../api/members';

const lookupMock = lookupWorkspaceMemberById as unknown as ReturnType<
  typeof vi.fn
>;

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function wrap(ui: React.ReactNode) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
  return (
    <QueryClientProvider client={client}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>
  );
}

describe('<MemberValue />', () => {
  it('renders resolved display name for inline variant', async () => {
    lookupMock.mockResolvedValue({
      id: 'user-1',
      display_name: 'Jane Doe',
      email: 'jane@example.com',
    });
    render(wrap(<MemberValue value="user-1" variant="inline" />));
    await waitFor(() => {
      expect(screen.getByText('Jane Doe')).toBeInTheDocument();
    });
    expect(lookupMock).toHaveBeenCalledWith('user-1', 'ws-1');
  });

  it('renders skeleton while loading', () => {
    lookupMock.mockReturnValue(new Promise(() => {}));
    render(wrap(<MemberValue value="user-1" />));
    expect(document.querySelector('[data-member-skeleton="1"]')).toBeTruthy();
  });

  it('renders fallback label when lookup misses', async () => {
    lookupMock.mockResolvedValue(null);
    render(wrap(<MemberValue value="abcdef123456" />));
    await waitFor(() => {
      expect(screen.getByText('Member 123456')).toBeInTheDocument();
    });
  });

  it('renders emptyFallback for empty value', () => {
    render(
      wrap(
        <MemberValue
          value={null}
          emptyFallback={<span data-testid="empty">—</span>}
        />,
      ),
    );
    expect(screen.getByTestId('empty')).toBeInTheDocument();
    expect(lookupMock).not.toHaveBeenCalled();
  });

  it('links to workspace members page', async () => {
    lookupMock.mockResolvedValue({
      id: 'user-1',
      display_name: 'Jane Doe',
      email: 'jane@example.com',
    });
    render(wrap(<MemberValue value="user-1" variant="cell" />));
    await waitFor(() => {
      expect(screen.getByText('Jane Doe').closest('a')).toHaveAttribute(
        'href',
        '/workspaces/ws-1/members',
      );
    });
  });
});
