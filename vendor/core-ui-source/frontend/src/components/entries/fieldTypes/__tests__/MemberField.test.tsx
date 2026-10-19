/**
 * ACC-08 — `member` field-type widget tests.
 *
 * Covers:
 * - Module-load side effect registers ``member`` in the field-type
 * registry (``./builtins`` import triggers registration).
 * - Initial value (User.id) resolves via workspace member lookup.
 * - Selecting a user via the picker calls ``onChange`` with that
 * user's ``id``.
 * - Clearing emits ``onChange(null)``.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { User } from '../../../../types';

vi.mock('../../../../context/ScopeContext', () => ({
  useScope: () => ({ scope: { workspaceId: 'ws-1' } }),
}));

vi.mock('../../../../api/members', () => ({
  lookupWorkspaceMemberById: vi.fn(),
}));

vi.mock('../../../collab/UserSearchPicker', () => ({
  UserSearchPicker: ({ onSelect }: { onSelect: (u: User) => void }) => (
    <button
      type="button"
      data-testid="picker-mock"
      onClick={() =>
        onSelect({
          id: 'user-id-picked',
          user_id: 'auth-picked',
          display_name: 'Picked User',
          email: 'picked@example.com',
        } as User)
      }
    >
      Pick
    </button>
  ),
}));

import { lookupWorkspaceMemberById } from '../../../../api/members';
import { MemberFieldEditor, memberFieldRegistration } from '../MemberField';
import { getFieldType } from '../registry';
import '../builtins';

const lookupMock = lookupWorkspaceMemberById as unknown as ReturnType<
  typeof vi.fn
>;

const memberOne: User = {
  id: 'user-id-1',
  user_id: 'auth-1',
  display_name: 'Member One',
  email: 'one@example.com',
} as User;

describe('member field-type widget', () => {
  beforeEach(() => {
    lookupMock.mockReset();
    lookupMock.mockResolvedValue(memberOne);
  });

  it('registers `member` in the field-type registry as a side effect of import', () => {
    const reg = getFieldType('member');
    expect(reg).toBeDefined();
    expect(reg?.type).toBe('member');
    expect(reg?.meta.label).toBe('Member');
    expect(reg).toBe(memberFieldRegistration);
  });

  it('renders nothing selected when value is empty and shows a seamless field trigger', () => {
    const onChange = vi.fn();
    render(
      <MemberFieldEditor
        field={{ key: 'assignee', type: 'member', name: 'Assignee' } as never}
        value={null}
        onChange={onChange}
      />,
    );
    expect(screen.getByRole('button', { name: 'Assignee' })).toBeInTheDocument();
    expect(screen.getByText(/enter assignee/i)).toBeInTheDocument();
  });

  it('resolves an initial User.id value and renders the member chip', async () => {
    const onChange = vi.fn();
    render(
      <MemberFieldEditor
        field={{ key: 'assignee', type: 'member', name: 'Assignee' } as never}
        value="user-id-1"
        onChange={onChange}
      />,
    );
    await waitFor(() => {
      expect(screen.getByText('Member One')).toBeInTheDocument();
    });
    expect(lookupMock).toHaveBeenCalledWith('user-id-1', 'ws-1');
  });

  it('selecting a user via the picker invokes onChange with that user id', async () => {
    const onChange = vi.fn();
    render(
      <MemberFieldEditor
        field={{ key: 'assignee', type: 'member', name: 'Assignee' } as never}
        value={null}
        onChange={onChange}
      />,
    );
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Assignee' }));
    await user.click(screen.getByTestId('picker-mock'));
    expect(onChange).toHaveBeenCalledWith('user-id-picked');
  });

  it('clear button emits onChange(null)', async () => {
    const onChange = vi.fn();
    render(
      <MemberFieldEditor
        field={{ key: 'assignee', type: 'member', name: 'Assignee' } as never}
        value="user-id-1"
        onChange={onChange}
      />,
    );
    await waitFor(() => {
      expect(screen.getByText('Member One')).toBeInTheDocument();
    });
    const user = userEvent.setup();
    await user.click(screen.getByLabelText(/clear member/i));
    expect(onChange).toHaveBeenCalledWith(null);
  });
});
