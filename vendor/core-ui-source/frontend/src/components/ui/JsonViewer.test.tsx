import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import JsonViewer from './JsonViewer';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

function clipboard(writeText: (text: string) => Promise<void>) {
  vi.stubGlobal('navigator', { clipboard: { writeText } });
}

describe('JSON clipboard feedback', () => {
  it('waits for clipboard completion before reporting copy-all success', async () => {
    let complete!: () => void;
    const writeText = vi.fn(() => new Promise<void>((resolve) => { complete = resolve; }));
    clipboard(writeText);
    const data = { command: 'save', inputs: { title: 'Full review input' } };
    render(<JsonViewer data={data} />);
    fireEvent.click(screen.getByRole('button', { name: 'Copy all' }));
    expect(writeText).toHaveBeenCalledWith(JSON.stringify(data, null, 2));
    expect(screen.queryByText('Copied')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Copying…' })).toBeDisabled();
    await act(async () => complete());
    expect(screen.getByRole('button', { name: 'Copied' })).toBeEnabled();
  });

  it('shows rejected writes and allows retry without claiming success', async () => {
    const writeText = vi.fn().mockRejectedValueOnce(new Error('denied')).mockResolvedValueOnce(undefined);
    clipboard(writeText);
    render(<JsonViewer data={{ title: 'Keep this exact text' }} />);
    fireEvent.click(screen.getByRole('button', { name: 'Copy all' }));
    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't copy");
    expect(screen.queryByText('Copied')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Copy all' }));
    expect(await screen.findByRole('button', { name: 'Copied' })).toBeEnabled();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(writeText).toHaveBeenCalledTimes(2);
  });

  it('handles missing clipboard support without an unhandled error', async () => {
    vi.stubGlobal('navigator', {});
    render(<JsonViewer data={{ title: 'Review' }} />);
    fireEvent.click(screen.getByRole('button', { name: 'Copy all' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('copy manually');
    expect(screen.queryByText('Copied')).not.toBeInTheDocument();
  });

  it('copies complete row identifiers and reports a row failure locally', async () => {
    const id = 'a'.repeat(64);
    const writeText = vi.fn().mockRejectedValueOnce(new Error('denied')).mockResolvedValueOnce(undefined);
    clipboard(writeText);
    render(<JsonViewer data={{ work_item_id: id }} />);
    fireEvent.click(screen.getByRole('button', { name: 'Copy work_item_id' }));
    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't copy");
    expect(writeText).toHaveBeenCalledWith(JSON.stringify(id));
    fireEvent.click(screen.getByRole('button', { name: 'Copy work_item_id' }));
    expect(await screen.findByRole('button', { name: 'Copied' })).toBeEnabled();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('ignores old copy completion when the displayed data changes', async () => {
    let complete!: () => void;
    clipboard(() => new Promise<void>((resolve) => { complete = resolve; }));
    const { rerender } = render(<JsonViewer data={{ title: 'Old' }} />);
    fireEvent.click(screen.getByRole('button', { name: 'Copy all' }));
    rerender(<JsonViewer data={{ title: 'New' }} />);
    await act(async () => complete());
    expect(screen.queryByText('Copied')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Copy all' })).toBeEnabled();
  });

  it('clears the success timer when unmounted', async () => {
    vi.useFakeTimers();
    clipboard(vi.fn().mockResolvedValue(undefined));
    const { unmount } = render(<JsonViewer data={{ title: 'Review' }} />);
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Copy all' })));
    expect(screen.getByRole('button', { name: 'Copied' })).toBeEnabled();
    expect(vi.getTimerCount()).toBe(1);
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('prevents duplicate row writes while the clipboard is pending', async () => {
    let complete!: () => void;
    const writeText = vi.fn(() => new Promise<void>((resolve) => { complete = resolve; }));
    clipboard(writeText);
    render(<JsonViewer data={{ title: 'Exact row text' }} />);
    const button = screen.getByRole('button', { name: 'Copy title' });
    fireEvent.click(button);
    fireEvent.click(button);
    expect(button).toBeDisabled();
    expect(writeText).toHaveBeenCalledTimes(1);
    expect(writeText).toHaveBeenCalledWith('"Exact row text"');
    await act(async () => complete());
    expect(screen.getByRole('button', { name: 'Copied' })).toBeEnabled();
  });

  it('does not schedule feedback when a pending write completes after unmount', async () => {
    vi.useFakeTimers();
    let complete!: () => void;
    clipboard(() => new Promise<void>((resolve) => { complete = resolve; }));
    const { unmount } = render(<JsonViewer data={{ title: 'Review' }} />);
    fireEvent.click(screen.getByRole('button', { name: 'Copy all' }));
    unmount();
    await act(async () => complete());
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe('bounded JSON identifiers', () => {
  it('uses visual ellipsis while retaining the complete identifier', () => {
    const id = 'a'.repeat(64);
    render(<JsonViewer data={{ work_item_id: id, body: 'Keep this complete review text.' }} />);
    const value = screen.getByTitle(id);
    expect(value).toHaveTextContent(id);
    expect(value).toHaveStyle({ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' });
    expect(screen.getByText(/Keep this complete review text/)).toHaveStyle({ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' });
  });
});
