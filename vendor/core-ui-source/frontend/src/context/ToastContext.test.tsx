import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ToastProvider, useToast } from './ToastContext';

afterEach(cleanup);

describe('bounded toast text', () => {
  it('truncates at the available width and keeps the full value on hover', () => {
    const message = `App update queued (${'a'.repeat(64)})`;
    function Trigger() {
      const { showToast } = useToast();
      return <button onClick={() => showToast(message, 'success')}>Show</button>;
    }
    render(<MemoryRouter><ToastProvider><Trigger /></ToastProvider></MemoryRouter>);
    fireEvent.click(screen.getByRole('button', { name: 'Show' }));
    expect(screen.getByTitle(message)).toHaveClass('min-w-0', 'flex-1', 'truncate');
    expect(screen.getByTitle(message)).toHaveTextContent(message);
    expect(screen.getByRole('button', { name: 'Dismiss' })).toBeVisible();
  });
});
