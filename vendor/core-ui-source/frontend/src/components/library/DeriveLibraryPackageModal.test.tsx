import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const { showToast } = vi.hoisted(() => ({ showToast: vi.fn() }));

vi.mock('../../context/ToastContext', () => ({
  useToast: () => ({ showToast }),
}));

vi.mock('../../templates', () => ({
  FormDialog: ({
    open,
    title,
    children,
    onSubmit,
    submitLabel,
    submitDisabled,
    submitLoading,
  }: {
    open: boolean;
    title: string;
    children: React.ReactNode;
    onSubmit?: () => void;
    submitLabel: string;
    submitDisabled?: boolean;
    submitLoading?: boolean;
  }) =>
    open ? (
      <div>
        <h2>{title}</h2>
        {children}
        <button disabled={submitDisabled || submitLoading} onClick={onSubmit}>
          {submitLabel}
        </button>
      </div>
    ) : null,
}));

vi.mock('../../ui', () => ({
  Text: ({ as: Component = 'span', children }: { as?: React.ElementType; children: React.ReactNode }) => (
    <Component>{children}</Component>
  ),
  Input: (props: React.InputHTMLAttributes<HTMLInputElement>) => <input {...props} />,
  Textarea: (props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) => <textarea {...props} />,
}));

import { DeriveLibraryPackageModal } from './DeriveLibraryPackageModal';

describe('DeriveLibraryPackageModal', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('shows the API message when a template exceeds the portable attachment limit', async () => {
    const onSubmit = vi.fn().mockRejectedValue({
      message: 'Request failed with status code 400',
      response: {
        data: {
          error_code: 'bad_request',
          message: 'Template attachments exceed the 25 MiB portable-template limit',
        },
      },
    });

    render(
      <DeriveLibraryPackageModal
        open
        onClose={vi.fn()}
        onSubmit={onSubmit}
        sourceLabel="App: Oversized source"
      />
    );

    fireEvent.change(screen.getByPlaceholderText("My team's onboarding profile"), {
      target: { value: 'Large template' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save template' }));

    await waitFor(() => {
      expect(showToast).toHaveBeenCalledWith(
        'This App’s attachments exceed the 25 MiB template limit. Remove some attachments or reduce their size, then try again.',
        'error'
      );
    });
    expect(showToast).not.toHaveBeenCalledWith(
      'Request failed with status code 400',
      'error'
    );
  });
});
