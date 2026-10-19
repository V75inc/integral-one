import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { KebabMenu } from '../KebabMenu';

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

it('keeps portalled actions keyboard reachable and returns focus on Tab', () => {
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
    x: 0, y: 0, left: 0, top: 0, right: 200, bottom: 100,
    width: 200, height: 100, toJSON: () => ({}),
  });
  render(<KebabMenu portal items={[
    {key:'one', label:'First action', onClick:vi.fn()},
    {key:'skip', label:'Disabled action', onClick:vi.fn(), disabled:true},
    {key:'two', label:'Last action', onClick:vi.fn()},
  ]} />);
  const trigger = screen.getByRole('button', {name:'More actions'});
  fireEvent.click(trigger);
  const first = screen.getByRole('menuitem', {name:'First action'});
  expect(first).toHaveFocus();
  fireEvent.keyDown(first, {key:'ArrowDown'});
  const last = screen.getByRole('menuitem', {name:'Last action'});
  expect(last).toHaveFocus();
  fireEvent.keyDown(last, {key:'Tab'});
  expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  expect(trigger).toHaveFocus();
});

it.each(['menu item', 'window'] as const)('dismisses Escape from %s without closing the enclosing dialog', target => {
  const parentEscape = vi.fn();
  window.addEventListener('keydown', parentEscape);
  try {
    render(<KebabMenu ariaLabel="More entry actions" items={[
      { key: 'post', label: 'Post to feed', onClick: vi.fn() },
    ]} />);
    const trigger = screen.getByRole('button', { name: 'More entry actions' });
    fireEvent.click(trigger);
    const action = screen.getByRole('menuitem', { name: 'Post to feed' });
    action.focus();
    fireEvent.keyDown(target === 'window' ? window : action, { key: 'Escape' });
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(parentEscape).not.toHaveBeenCalled();
    expect(trigger).toHaveFocus();
  } finally {
    window.removeEventListener('keydown', parentEscape);
  }
});
