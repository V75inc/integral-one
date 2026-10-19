import type { ComponentProps } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';

vi.mock('../../../context/ToastContext', () => ({
  useToast: () => ({ showToast: vi.fn() }),
}));

import { EntryFormExpandedView } from '../EntryFormExpanded';

type ViewProps = ComponentProps<typeof EntryFormExpandedView>;

afterEach(() => {
  cleanup();
});

const noop = () => {};

function baseProps(overrides: Record<string, unknown> = {}) {
  return {
    needsTrackPicker: false,
    tracksList: [],
    selectedTrackId: 'track-1',
    setSelectedTrackId: noop,
    type: 'invoice',
    setType: noop,
    typeOptions: [{ value: 'invoice', label: 'Invoice' }],
    entryTypes: [],
    profileInformedTags: [],
    tagOptions: [],
    selectedTagIds: [] as string[],
    setSelectedTagIds: noop,
    title: '',
    setTitle: noop,
    body: '',
    setBody: noop,
    composerRows: [
      {
        kind: 'title' as const,
      },
      {
        kind: 'field' as const,
        field: { key: 'customer_name', name: 'Customer', type: 'text' as const },
      },
    ],
    effectiveTitlePlaceholder: 'Invoice title',
    effectiveBodyPlaceholder: 'Notes',
    titleBase: { label: 'Title' },
    bodyBase: { label: 'Body' },
    titleEnabled: true,
    bodyEnabled: false,
    attachmentsEnabled: false,
    allowFileUpload: false,
    allowUrlReference: false,
    attachmentsHelp: '',
    linkPreviewLoading: false,
    linkPreview: null,
    dismissedPreviewUrl: null,
    dismissLinkPreview: noop,
    pendingFiles: [] as File[],
    setPendingFiles: noop,
    pendingUrlAttachments: [] as { url: string; label?: string }[],
    setPendingUrlAttachments: noop,
    addPendingFiles: noop,
    addLinkAttachment: noop,
    fieldValues: {} as Record<string, unknown>,
    setFieldValues: noop,
    fieldErrors: {} as Record<string, string>,
    loading: false,
    selectedType: null,
    renderDynamicField: (field: { name: string }) => (
      <label key={field.name}>{field.name}</label>
    ),
    composeExtraSection: null,
    ownsForm: false,
    primaryLabel: 'Create invoice',
    onPrimary: noop,
    onCancel: noop,
    hideAttachmentsRow: true,
    ...overrides,
  };
}

describe('EntryFormExpandedView owns_form', () => {
  it('hides default composer rows when ownsForm is true but keeps actions', () => {
    render(<EntryFormExpandedView {...(baseProps({ ownsForm: true }) as unknown as ViewProps)} />);

    expect(screen.queryByPlaceholderText('Invoice title')).not.toBeInTheDocument();
    expect(screen.queryByText('Customer')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create invoice' })).toBeInTheDocument();
  });

  it('renders composer rows when ownsForm is false', () => {
    render(<EntryFormExpandedView {...(baseProps({ ownsForm: false }) as unknown as ViewProps)} />);

    expect(screen.getByPlaceholderText('Invoice title')).toBeInTheDocument();
    expect(screen.getByText('Customer')).toBeInTheDocument();
  });
});
