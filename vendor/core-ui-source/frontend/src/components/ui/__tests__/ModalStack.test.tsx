import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Modal } from '../Modal';

describe('stacked modal keyboard ownership', () => {
  it('closes only the upper dialog on Escape', () => {
    const parentClose = vi.fn();
    const childClose = vi.fn();
    render(<><Modal open title="Entry" onClose={parentClose}>Entry body</Modal><Modal open title="Post to feed" onClose={childClose}>Post body</Modal></>);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(childClose).toHaveBeenCalledOnce();
    expect(parentClose).not.toHaveBeenCalled();
  });
  it('keeps the body locked until all dialogs close', () => {
    document.body.style.overflow = 'auto';
    const { rerender, unmount } = render(<><Modal open title="Entry" onClose={() => {}}>Entry</Modal><Modal open title="Post" onClose={() => {}}>Post</Modal></>);
    expect(document.body.style.overflow).toBe('hidden');
    rerender(<><Modal open title="Entry" onClose={() => {}}>Entry</Modal><Modal open={false} title="Post" onClose={() => {}}>Post</Modal></>);
    expect(document.body.style.overflow).toBe('hidden');
    rerender(<><Modal open title="Entry" onClose={() => {}}>Entry</Modal><Modal open title="Post" onClose={() => {}}>Post</Modal></>);
    unmount();
    expect(document.body.style.overflow).toBe('auto');
    document.body.style.overflow = '';
  });
  it('keeps Tab in the upper dialog', () => {
    const visible = vi.spyOn(HTMLElement.prototype, 'offsetParent', 'get').mockReturnValue(document.body);
    try {
      render(<><Modal open title="Entry" onClose={() => {}}><button>Entry action</button></Modal><Modal open title="Post to feed" onClose={() => {}}><button>Post action</button></Modal></>);
      screen.getByRole('button', { name: 'Post action' }).focus();
      fireEvent.keyDown(window, { key: 'Tab' });
      expect(screen.getByRole('dialog', { name: 'Post to feed' })).toContainElement(document.activeElement as HTMLElement);
      expect(screen.getByRole('dialog', { name: 'Entry' })).not.toContainElement(document.activeElement as HTMLElement);
    } finally { visible.mockRestore(); }
  });
});

it('keeps an owned lookup footer in the dialog keyboard cycle', () => {
  const visible = vi.spyOn(HTMLElement.prototype, 'offsetParent', 'get').mockReturnValue(document.body);
  const popup = document.createElement('div');
  popup.setAttribute('data-integral-popover-owner', 'lookup-results');
  popup.innerHTML = '<ul id="lookup-results" role="listbox"></ul><button>Next page</button>';
  document.body.appendChild(popup);
  try {
    render(<Modal open title="Entry" onClose={() => {}}><input aria-label="Lookup" aria-expanded="true" aria-controls="lookup-results" /><button>Following field</button></Modal>);
    screen.getByLabelText('Lookup').focus();
    fireEvent.keyDown(document.activeElement!, {key: 'Tab'});
    expect(document.activeElement).toBe(screen.getByText('Next page'));
    fireEvent.keyDown(document.activeElement!, {key: 'Tab'});
    expect(document.activeElement).toBe(screen.getByText('Following field'));
  } finally {visible.mockRestore(); popup.remove();}
});
