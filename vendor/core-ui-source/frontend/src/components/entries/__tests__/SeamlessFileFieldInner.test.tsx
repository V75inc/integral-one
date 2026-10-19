/**
 * SeamlessFileFieldInner — FileList copy-before-clear + local file chips.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, act, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { SeamlessFileFieldInner } from '../SeamlessFileFieldInner';
import type { OperationalModelFieldSpec } from '../../../types';

vi.mock('../../../context/ToastContext', () => ({
  useToast: () => ({ showToast: vi.fn() }),
}));

vi.mock('../../../api/attachments', () => ({
  attachmentsApi: {
    get: vi.fn(),
    uploadForEntry: vi.fn(),
  },
}));

vi.mock('../../../features/memberAssignedForm/memberAssignedFormApi', () => ({
  memberAssignedFormApi: {
    uploadAttachment: vi.fn(),
  },
}));

afterEach(() => {
  cleanup();
});

const documentField: OperationalModelFieldSpec = {
  key: 'tin_document',
  name: 'TIN document',
  type: 'file',
  required: true,
};

describe('SeamlessFileFieldInner', () => {
  it('shows a filename chip when a local File is attached (create mode)', () => {
    const file = new File(['tin'], 'tin-scan.pdf', { type: 'application/pdf' });
    render(
      <SeamlessFileFieldInner
        field={documentField}
        value={file}
        onChange={() => {}}
        many={false}
        readonly={false}
      />,
    );
    expect(screen.getByText('tin-scan.pdf')).toBeInTheDocument();
    expect(screen.getByLabelText('Remove tin-scan.pdf')).toBeInTheDocument();
  });

  it('copies FileList before clearing the input so the chip appears', async () => {
    const onChange = vi.fn();
    const { container } = render(
      <SeamlessFileFieldInner
        field={documentField}
        value={null}
        onChange={onChange}
        many={false}
        readonly={false}
      />,
    );
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    expect(input).toBeTruthy();

    const file = new File(['x'], 'From-Picker.pdf', { type: 'application/pdf' });
    await act(async () => {
      Object.defineProperty(input, 'files', {
        configurable: true,
        get() {
          return (this as unknown as { _files: FileList | null })._files ?? null;
        },
      });
      (input as unknown as { _files: FileList | null })._files = {
        0: file,
        length: 1,
        item: (i: number) => (i === 0 ? file : null),
        [Symbol.iterator]: function* () {
          yield file;
        },
      } as unknown as FileList;

      Object.defineProperty(input, 'value', {
        configurable: true,
        set() {
          (input as unknown as { _files: FileList | null })._files = {
            length: 0,
            item: () => null,
            [Symbol.iterator]: function* () {},
          } as unknown as FileList;
        },
        get() {
          return '';
        },
      });

      fireEvent.change(input);
    });

    expect(onChange).toHaveBeenCalledWith(file);
    expect(await screen.findByText('From-Picker.pdf')).toBeInTheDocument();
  });
});
