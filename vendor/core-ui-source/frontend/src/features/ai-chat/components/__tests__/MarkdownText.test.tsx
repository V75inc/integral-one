import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ message: { status: { type: 'running' } } }));
vi.mock('@assistant-ui/react', () => ({
  useAuiState: (selector: (value: typeof state) => unknown) => selector(state),
}));
vi.mock('@assistant-ui/react-markdown', () => ({
  MarkdownTextPrimitive: ({ smooth }: { smooth: boolean }) => (
    <div data-testid="markdown" data-smooth={String(smooth)} />
  ),
  unstable_memoizeMarkdownComponents: (components: unknown) => components,
  useIsMarkdownCodeBlock: () => false,
}));
import { MarkdownText } from '../MarkdownText';

describe('Markdown lifecycle adapter', () => {
  it('interpolates live output and publishes the complete settled replacement', () => {
    state.message.status.type = 'running';
    const { rerender } = render(<MarkdownText />);
    expect(screen.getByTestId('markdown')).toHaveAttribute('data-smooth', 'true');
    state.message.status.type = 'complete';
    // A real context subscription invalidates the memoized leaf on status change.
    rerender(<MarkdownText key="settled" />);
    expect(screen.getByTestId('markdown')).toHaveAttribute('data-smooth', 'false');
  });

  it('does not keep an interpolation prefix after interruption', () => {
    state.message.status.type = 'incomplete';
    render(<MarkdownText />);
    expect(screen.getByTestId('markdown')).toHaveAttribute('data-smooth', 'false');
  });
});
