import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act, fireEvent } from '@testing-library/react';
import type { User } from '../../../types';

vi.mock('../../../api', () => ({
  usersApi: {
    list: vi.fn(),
  },
}));

vi.mock('../../../api/members', () => ({
  listWorkspaceMembersForPicker: vi.fn(),
}));

vi.mock('../../../context/ScopeContext', () => ({
  useScope: () => ({ scope: { workspaceId: 'ws-1' } }),
}));

import { usersApi } from '../../../api';
import { listWorkspaceMembersForPicker } from '../../../api/members';
import { UserSearchPicker } from '../UserSearchPicker';

const usersListMock = usersApi.list as unknown as ReturnType<typeof vi.fn>;
const workspaceMembersMock = listWorkspaceMembersForPicker as unknown as ReturnType<
  typeof vi.fn
>;

const alice: User = {
  id: 'user-1',
  user_id: 'auth-1',
  display_name: 'Alice',
  email: 'alice@example.com',
} as User;

describe('UserSearchPicker', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    usersListMock.mockReset();
    usersListMock.mockResolvedValue({ users: [alice], total: 1 });
    workspaceMembersMock.mockReset();
    workspaceMembersMock.mockResolvedValue([alice]);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('debounces search until typing stops and does not re-query on parent re-renders', async () => {
    const onSelect = vi.fn();
    const { rerender } = render(
      <UserSearchPicker onSelect={onSelect} excludeIds={undefined} />
    );

    await act(async () => {
      await vi.runOnlyPendingTimersAsync();
    });

    const input = screen.getByLabelText(/search users by name/i);
    fireEvent.change(input, { target: { value: 'al' } });

    await act(async () => {
      await vi.runOnlyPendingTimersAsync();
    });

    expect(usersListMock).toHaveBeenCalledTimes(2);
    expect(usersListMock).toHaveBeenLastCalledWith({
      search: 'al',
      per_page: 20,
      page: 1,
    });

    rerender(<UserSearchPicker onSelect={onSelect} excludeIds={undefined} />);
    rerender(<UserSearchPicker onSelect={onSelect} excludeIds={undefined} />);

    await act(async () => {
      await vi.runOnlyPendingTimersAsync();
    });

    expect(usersListMock).toHaveBeenCalledTimes(2);
    expect(screen.queryByText(/searching/i)).not.toBeInTheDocument();
  });

  it('workspace pool searches workspace members instead of the global directory', async () => {
    const onSelect = vi.fn();
    render(<UserSearchPicker onSelect={onSelect} pool="workspace" />);

    await act(async () => {
      await vi.runOnlyPendingTimersAsync();
    });

    const input = screen.getByLabelText(/search users by name/i);
    fireEvent.change(input, { target: { value: 'al' } });

    await act(async () => {
      await vi.runOnlyPendingTimersAsync();
    });

    expect(workspaceMembersMock).toHaveBeenLastCalledWith('ws-1', 'al');
    expect(usersListMock).not.toHaveBeenCalled();
  });

  it('loads workspace members on mount without typing', async () => {
    const onSelect = vi.fn();
    render(<UserSearchPicker onSelect={onSelect} pool="workspace" />);

    await act(async () => {
      await vi.runOnlyPendingTimersAsync();
    });

    expect(workspaceMembersMock).toHaveBeenCalledWith('ws-1', '');
    expect(screen.getByRole('option', { name: /alice/i })).toBeInTheDocument();
  });

  it('selects a user when clicking a result row', async () => {
    const onSelect = vi.fn();
    render(<UserSearchPicker onSelect={onSelect} pool="workspace" />);

    await act(async () => {
      await vi.runOnlyPendingTimersAsync();
    });

    fireEvent.click(screen.getByRole('option', { name: /alice/i }));
    expect(onSelect).toHaveBeenCalledWith(alice);
  });

  it('loads an initial directory list without typing', async () => {
    const onSelect = vi.fn();
    render(<UserSearchPicker onSelect={onSelect} />);

    await act(async () => {
      await vi.runOnlyPendingTimersAsync();
    });

    expect(usersListMock).toHaveBeenCalledWith({
      per_page: 20,
      page: 1,
    });
    expect(screen.getByRole('option', { name: /alice/i })).toBeInTheDocument();
  });

  it('filters directory results when two or more characters are entered', async () => {
    const onSelect = vi.fn();
    render(<UserSearchPicker onSelect={onSelect} />);

    await act(async () => {
      await vi.runOnlyPendingTimersAsync();
    });

    const input = screen.getByLabelText(/search users by name/i);
    fireEvent.change(input, { target: { value: 'al' } });

    await act(async () => {
      await vi.runOnlyPendingTimersAsync();
    });

    expect(usersListMock).toHaveBeenLastCalledWith({
      search: 'al',
      per_page: 20,
      page: 1,
    });
  });
});
