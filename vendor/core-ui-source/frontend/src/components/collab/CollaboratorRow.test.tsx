import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { CollaboratorRow } from './CollaboratorRow';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

it('keeps the role menu inside the dialog and opens it above a low trigger', () => {
  const remove = vi.fn();
  render(
    <div role="dialog" aria-label="Collaborators">
      <ul>
        <CollaboratorRow avatar={null} name="Reviewer" role="commenter" onRemove={remove} />
      </ul>
    </div>,
  );
  const trigger = screen.getByRole('button', { name: 'Commenter' });
  vi.spyOn(trigger, 'getBoundingClientRect').mockReturnValue({
    x: 50, y: 650, top: 650, bottom: 680, left: 50, right: 150,
    width: 100, height: 30, toJSON: () => ({}),
  });
  fireEvent.click(trigger);
  const menu = within(screen.getByRole('dialog', { name: 'Collaborators' })).getByRole('menu');
  expect(menu.style.bottom).not.toBe('');
  expect(menu.style.top).toBe('');
  fireEvent.click(within(menu).getByRole('menuitem', { name: 'Remove' }));
  expect(remove).toHaveBeenCalledOnce();
});
