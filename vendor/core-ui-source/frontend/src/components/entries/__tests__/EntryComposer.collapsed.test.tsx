/**
 * EntryComposer create-button regression — B-ENT-01.
 *
 * Asserts that the collapsed create button opens the compose dialog
 * and that the label reflects the view's default entry type.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { MemoryRouter } from 'react-router-dom';
import { ToastProvider } from '../../../context/ToastContext';

// Mock useEntryExpandedForm so we can observe profile-driven labels and
// avoid pulling in API / profile / relations loaders in this test.
const useEntryExpandedFormMock = vi.fn();
vi.mock('../EntryFormExpanded', () => ({
  useEntryExpandedForm: (opts: Record<string, unknown>) => {
    useEntryExpandedFormMock(opts);
    return {
      loading: false,
      composerInviteText: 'Add an entry…',
      composerActionLabel: 'New Post',
      needsTrackPicker: false,
      tracksList: [],
      type: 'post',
      typeOptions: ['post'],
      entryTypes: [],
      composerRows: [],
      titleEnabled: true,
      bodyEnabled: true,
      attachmentsEnabled: false,
      handleSubmitCreate: vi.fn(),
      cancelCreate: vi.fn(),
      title: opts.initialTitle ?? '',
      setTitle: vi.fn(),
      body: '',
      setBody: vi.fn(),
    };
  },
  EntryFormExpandedView: () => <div data-testid="expanded-view" />,
}));

import { EntryComposer } from '../EntryComposer';

const stubTrack = {
  id: 't1',
  title: 'Pipeline',
  description: '',
} as never;

afterEach(() => {
  cleanup();
  useEntryExpandedFormMock.mockReset();
});

function renderHarness(props: { viewDefaultEntryTypeKey?: string } = {}) {
  return render(
    <MemoryRouter>
      <ToastProvider>
        <EntryComposer track={stubTrack} {...props} />
      </ToastProvider>
    </MemoryRouter>,
  );
}

describe('<EntryComposer /> create button', () => {
  it('renders a primary button with the Operational Model action label', () => {
    renderHarness();
    const button = screen.getByRole('button', { name: 'New Post' });
    expect(button).toBeInTheDocument();
    expect(button).toHaveTextContent('New Post');
  });

  it('clicking the button opens the create dialog', () => {
    renderHarness();
    fireEvent.click(screen.getByRole('button', { name: 'New Post' }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByTestId('expanded-view')).toBeInTheDocument();
    const createFormCall = useEntryExpandedFormMock.mock.calls.find(
      ([opts]) => opts.enabled === true && opts.relationsEnabled === true,
    );
    expect(createFormCall?.[0].initialTitle).toBeUndefined();
  });

  it('compose dialog exposes a maximize control', () => {
    renderHarness();
    fireEvent.click(screen.getByRole('button', { name: 'New Post' }));
    const expand = screen.getByTestId('entry-compose-dialog-expand');
    expect(expand).toBeInTheDocument();
    expect(expand).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(expand);
    expect(expand).toHaveAttribute('aria-pressed', 'true');
  });

  it('keyboard shortcut N opens the create dialog', () => {
    renderHarness();
    fireEvent.keyDown(window, { key: 'n' });
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('does not open the dialog when N is pressed inside an input', () => {
    renderHarness();
    const input = document.createElement('input');
    document.body.appendChild(input);
    input.focus();
    fireEvent.keyDown(input, { key: 'n' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    input.remove();
  });
});
