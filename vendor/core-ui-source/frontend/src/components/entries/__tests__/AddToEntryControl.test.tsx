import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  cleanup,
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { AddToEntryControl } from '../AddToEntryControl';

afterEach(cleanup);

const transfer = (files: File[]) => ({
  files,
  items: files.map(file => ({
    kind: 'file',
    type: file.type,
    getAsFile: () => file,
  })),
  types: ['Files'],
});

describe('AddToEntryControl', () => {
  it('accepts a batch dropped on the instruction area and resets its drag hint', async () => {
    const onFilesAdded = vi.fn();
    render(<AddToEntryControl onFilesAdded={onFilesAdded} />);
    const instruction = screen.getByText(
      'Drop files here or use the attachment buttons.',
    );
    const files = [
      new File(['receipt'], 'receipt.txt', { type: 'text/plain' }),
      new File(['invoice'], 'invoice.txt', { type: 'text/plain' }),
    ];
    fireEvent.dragEnter(instruction, { dataTransfer: transfer(files) });
    await screen.findByText('Drop to attach');
    fireEvent.drop(screen.getByText('Drop to attach'), {
      dataTransfer: transfer(files),
    });
    await waitFor(() =>
      expect(onFilesAdded).toHaveBeenCalledExactlyOnceWith(files),
    );
    expect(
      screen.getByText('Drop files here or use the attachment buttons.'),
    ).toBeVisible();
  });

  it('does not accept dropped files when uploading is disabled', async () => {
    const onFilesAdded = vi.fn();
    render(
      <AddToEntryControl
        onFilesAdded={onFilesAdded}
        allowFileUpload={false}
        onLinkAdded={vi.fn()}
      />,
    );
    const instruction = screen.getByText(
      'Use the link button to attach a web address.',
    );
    const files = [new File(['x'], 'blocked.txt', { type: 'text/plain' })];
    await act(async () => {
      fireEvent.drop(instruction, { dataTransfer: transfer(files) });
    });
    expect(onFilesAdded).not.toHaveBeenCalled();
    expect(
      screen.queryByRole('button', { name: 'Attach files' }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add link' })).toBeVisible();
  });

  it('keeps the link form usable alongside the file drop area', async () => {
    const onLinkAdded = vi.fn();
    render(
      <AddToEntryControl onFilesAdded={vi.fn()} onLinkAdded={onLinkAdded} />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Add link' }));
    fireEvent.change(screen.getByPlaceholderText('https://…'), {
      target: { value: 'https://example.com/receipt' },
    });
    fireEvent.keyDown(screen.getByPlaceholderText('https://…'), {
      key: 'Enter',
    });
    expect(onLinkAdded).toHaveBeenCalledExactlyOnceWith(
      'https://example.com/receipt',
      undefined,
    );
    await waitFor(() =>
      expect(
        screen.queryByPlaceholderText('https://…'),
      ).not.toBeInTheDocument(),
    );
  });
});
