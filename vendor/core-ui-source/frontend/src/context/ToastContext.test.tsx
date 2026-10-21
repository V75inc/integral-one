import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ToastProvider, useToast } from './ToastContext';

afterEach(cleanup);

describe('bounded toast text', () => {
  it('wraps to three lines and keeps the full value on hover', () => {
    const message = `App update queued (${'a'.repeat(64)})`;
    function Trigger() {
      const { showToast } = useToast();
      return <button onClick={() => showToast(message, 'success')}>Show</button>;
    }
    render(<MemoryRouter><ToastProvider><Trigger /></ToastProvider></MemoryRouter>);
    fireEvent.click(screen.getByRole('button', { name: 'Show' }));
    expect(screen.getByTitle(message)).toHaveClass('line-clamp-3', 'whitespace-pre-line', '[overflow-wrap:anywhere]');
    expect(screen.getByTitle(message)).toHaveTextContent(message);
    expect(screen.getByRole('button', { name: 'Dismiss' })).toBeVisible();
  });
});
