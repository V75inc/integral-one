import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { StrictMode, useEffect } from 'react';
import { ConfirmProvider, useConfirm } from '../ConfirmContext';

describe('confirmation lifecycle', () => {
  it('cancels pending and late requests from an unmounted session', async () => {
    let confirm!: ReturnType<typeof useConfirm>;
    function Consumer() { confirm = useConfirm(); return null; }
    const { unmount } = render(<ConfirmProvider><Consumer /></ConfirmProvider>);
    let pending!: Promise<boolean>;
    act(() => { pending = confirm({ title: 'Delete App', message: 'Private content' }); });
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    unmount();
    await expect(pending).resolves.toBe(false);
    await expect(confirm({ title: 'Late deletion', message: 'Old session' })).resolves.toBe(false);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('keeps effect-created prompts usable under StrictMode', async () => {
    const result = vi.fn();
    function Consumer() {
      const confirm = useConfirm();
      useEffect(() => {
        void confirm({ title: 'Review', message: 'Current action' }).then(result);
      }, [confirm]);
      return null;
    }
    render(<StrictMode><ConfirmProvider><Consumer /></ConfirmProvider></StrictMode>);
    fireEvent.click(screen.getByRole('button', { name: 'OK' }));
    await act(async () => {});
    expect(result.mock.calls.map(([value]) => value)).toEqual([false, true]);
  });

  it('cancels a replaced request instead of orphaning its promise', async () => {
    let confirm!: ReturnType<typeof useConfirm>;
    function Consumer() { confirm = useConfirm(); return null; }
    render(<ConfirmProvider><Consumer /></ConfirmProvider>);
    let first!: Promise<boolean>;
    let second!: Promise<boolean>;
    act(() => { first = confirm({ title: 'First', message: 'First action' }); });
    act(() => { second = confirm({ title: 'Second', message: 'Second action' }); });
    await expect(first).resolves.toBe(false);
    fireEvent.click(screen.getByRole('button', { name: 'OK' }));
    await expect(second).resolves.toBe(true);
  });
});
