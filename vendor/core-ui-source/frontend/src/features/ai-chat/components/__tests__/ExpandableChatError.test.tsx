import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ExpandableChatError } from '../ExpandableChatError';

describe('chat error disclosure', () => {
  it('does not offer expansion for a brief repeated message', () => {
    render(<ExpandableChatError summary={<span>Try again.</span>}><p>Try again.</p></ExpandableChatError>);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.getAllByText('Try again.').filter(node => !node.closest('[hidden]'))).toHaveLength(1);
  });

  it('only reveals distinct additional details when expanded', () => {
    render(<ExpandableChatError summary="The model is unavailable.">Choose another model in Settings.</ExpandableChatError>);
    const trigger = screen.getByRole('button', { name: 'The model is unavailable.' });
    expect(screen.queryByText('Choose another model in Settings.')).not.toBeInTheDocument();
    fireEvent.click(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('Choose another model in Settings.')).toBeVisible();
    fireEvent.click(trigger);
    expect(screen.queryByText('Choose another model in Settings.')).not.toBeInTheDocument();
  });

  it('removes the disclosure when additional detail is removed', () => {
    const { rerender } = render(<ExpandableChatError summary="Try again.">More details.</ExpandableChatError>);
    expect(screen.getByRole('button')).toBeInTheDocument();
    rerender(<ExpandableChatError summary="Try again." />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('expands clipped summary text in place instead of duplicating it', () => {
    vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockReturnValue(72);
    vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(36);
    render(<ExpandableChatError summary="A longer provider error that wraps across several lines." />);
    act(() => window.dispatchEvent(new Event('resize')));
    const trigger = screen.getByRole('button', { name: /A longer provider error/ });
    fireEvent.click(trigger);
    expect(screen.getAllByText(/A longer provider error/)).toHaveLength(1);
    expect(screen.getByText(/A longer provider error/)).not.toHaveClass('line-clamp-2');
    vi.restoreAllMocks();
  });
});
