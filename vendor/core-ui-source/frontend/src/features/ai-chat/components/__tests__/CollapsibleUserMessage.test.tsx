import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CollapsibleUserMessage } from '../CollapsibleUserMessage';

afterEach(() => vi.restoreAllMocks());

describe('long user messages', () => {
  it('leaves brief messages without a disclosure', () => {
    render(<CollapsibleUserMessage>Hello there.</CollapsibleUserMessage>);
    expect(screen.getByText('Hello there.')).toBeVisible();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('collapses overflowing text and expands the original content, preserving links', () => {
    vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockReturnValue(640);
    vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(256);
    render(<CollapsibleUserMessage><p>A lengthy request with <a href="/apps/example">an App reference</a>.</p></CollapsibleUserMessage>);
    const toggle = screen.getByRole('button', { name: 'Show more' });
    const preview = document.getElementById(toggle.getAttribute('aria-controls')!)!;
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(preview).toHaveClass('overflow-hidden');
    fireEvent.click(toggle);
    expect(toggle).toHaveAccessibleName('Show less');
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(preview).not.toHaveClass('overflow-hidden');
    expect(screen.getAllByRole('link', { name: 'an App reference' })).toHaveLength(1);
    expect(screen.getByRole('link')).toHaveAttribute('href', '/apps/example');
    fireEvent.click(toggle);
    expect(preview).toHaveClass('overflow-hidden');
    expect(toggle).toHaveAccessibleName('Show more');
  });

  it('remeasures when the available space changes and removes unnecessary controls', () => {
    let height = 80;
    vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockImplementation(() => height);
    vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(160);
    render(<CollapsibleUserMessage>A request that wraps in a narrow dock.</CollapsibleUserMessage>);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    height = 320;
    act(() => window.dispatchEvent(new Event('resize')));
    expect(screen.getByRole('button', { name: 'Show more' })).toBeInTheDocument();
    height = 80;
    act(() => window.dispatchEvent(new Event('resize')));
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});
