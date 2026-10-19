/**
 * Phase 8 Plan 08-05 — Vitest coverage for SharingSection (SET-08).
 *
 * Covers (per plan behavior):
 *   1. renders loading skeletons while query in flight
 *   2. renders 3 sub-sections with empty-state text when all buckets empty
 *   3. renders share-links list with one row per OutboundShareLink
 *   4. clicking revoke on a share link row opens confirm then calls
 *      sharingApi.revokeLink + invalidates the sharing-overview query
 *   5. renders exclusions list with one row per OutboundExclusion
 *   6. renders invitations list and clicking revoke calls
 *      invitationsApi.revokeAny (NEW Task 3 wrapper)
 *   7. each resource label is a react-router Link with href matching
 *      `/tracks/<id>` / `/apps/<id>` / `/entries/<id>` — asserts the
 *      cross-link to per-resource control surfaces (A2 — no duplication)
 */
import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  afterEach,
} from 'vitest';
import {
  render,
  screen,
  fireEvent,
  waitFor,
  cleanup,
} from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';

vi.mock('../../../../api/sharingOverview', () => ({
  sharingOverviewApi: {
    get: vi.fn(),
  },
}));

vi.mock('../../../../api/sharing', () => ({
  sharingApi: {
    revokeLink: vi.fn(),
    removeExclusion: vi.fn(),
  },
}));

vi.mock('../../../../api/invitations', () => ({
  invitationsApi: {
    revokeAny: vi.fn(),
  },
}));

import {
  sharingOverviewApi,
  type OutboundExclusion,
  type OutboundInvitation,
  type OutboundShareLink,
  type SharingOverviewResponse,
} from '../../../../api/sharingOverview';
import { sharingApi } from '../../../../api/sharing';
import { invitationsApi } from '../../../../api/invitations';
import { SharingSection } from '../SharingSection';
import { ToastProvider } from '../../../../context/ToastContext';
import { ConfirmProvider } from '../../../../context/ConfirmContext';

const mockedGet = sharingOverviewApi.get as unknown as ReturnType<typeof vi.fn>;
const mockedRevokeLink =
  sharingApi.revokeLink as unknown as ReturnType<typeof vi.fn>;
const mockedRemoveExclusion =
  sharingApi.removeExclusion as unknown as ReturnType<typeof vi.fn>;
const mockedRevokeAny =
  invitationsApi.revokeAny as unknown as ReturnType<typeof vi.fn>;

function makeLink(overrides: Partial<OutboundShareLink> = {}): OutboundShareLink {
  return {
    id: 'sl-1',
    resource_type: 'track',
    resource_id: 't-1',
    resource_label: 'My Track',
    role: 'viewer',
    created_at: '2026-05-17T00:00:00Z',
    expires_at: null,
    redemptions: 0,
    ...overrides,
  };
}

function makeExclusion(overrides: Partial<OutboundExclusion> = {}): OutboundExclusion {
  return {
    resource_type: 'app',
    resource_id: 's-1',
    resource_label: 'My App',
    excluded_user_id: 'u-other',
    excluded_user_display: 'Other User',
    reason: 'temporary',
    created_at: '2026-05-17T00:00:00Z',
    ...overrides,
  };
}

function makeInvitation(
  overrides: Partial<OutboundInvitation> = {},
): OutboundInvitation {
  return {
    id: 'inv-1',
    resource_type: 'entry',
    resource_id: 'e-1',
    resource_label: 'My Entry',
    invitee_email: 'invitee@example.com',
    invitee_user_id: null,
    role: 'viewer',
    status: 'pending',
    created_at: '2026-05-17T00:00:00Z',
    expires_at: null,
    ...overrides,
  };
}

function emptyResponse(): SharingOverviewResponse {
  return { share_links: [], exclusions: [], invitations: [] };
}

function renderPanel() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <ToastProvider>
          <ConfirmProvider>
            <SharingSection />
          </ConfirmProvider>
        </ToastProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockedRevokeLink.mockResolvedValue(undefined);
  mockedRemoveExclusion.mockResolvedValue(undefined);
  mockedRevokeAny.mockResolvedValue({});
});

afterEach(() => {
  cleanup();
});

describe('<SharingSection />', () => {
  it('renders loading skeletons while query is in flight', async () => {
    // Hang the promise so isLoading stays true.
    let resolve!: (v: SharingOverviewResponse) => void;
    mockedGet.mockReturnValue(
      new Promise(r => {
        resolve = r;
      }),
    );
    renderPanel();
    await waitFor(() => {
      const skeletons = document.querySelectorAll('.animate-pulse');
      expect(skeletons.length).toBeGreaterThan(0);
    });
    resolve(emptyResponse());
  });

  it('renders 3 sub-sections with empty-state text when buckets empty', async () => {
    mockedGet.mockResolvedValueOnce(emptyResponse());
    renderPanel();
    await waitFor(() => {
      expect(screen.getByText(/No active links/i)).toBeInTheDocument();
    });
    expect(screen.getByText(/No exclusions/i)).toBeInTheDocument();
    expect(screen.getByText(/No pending invitations/i)).toBeInTheDocument();
  });

  it('renders share links list with one row per OutboundShareLink', async () => {
    mockedGet.mockResolvedValueOnce({
      share_links: [
        makeLink({ id: 'sl-a', resource_id: 'ta', resource_label: 'Alpha' }),
        makeLink({
          id: 'sl-b',
          resource_id: 'tb',
          resource_label: 'Beta',
          role: 'editor',
        }),
      ],
      exclusions: [],
      invitations: [],
    });
    renderPanel();
    await waitFor(() => {
      expect(screen.getByText('Alpha')).toBeInTheDocument();
    });
    expect(screen.getByText('Beta')).toBeInTheDocument();
  });

  it('clicking revoke on a share link opens confirm then calls revokeLink', async () => {
    mockedGet.mockResolvedValueOnce({
      share_links: [makeLink({ id: 'sl-x' })],
      exclusions: [],
      invitations: [],
    });
    renderPanel();
    const revokeBtn = await screen.findByRole('button', {
      name: /Revoke share link sl-x/i,
    });
    fireEvent.click(revokeBtn);
    // Confirm dialog opens — "Revoke" confirm button.
    const confirmBtn = await screen.findByRole('button', { name: /^Revoke$/ });
    fireEvent.click(confirmBtn);
    await waitFor(() => {
      expect(mockedRevokeLink).toHaveBeenCalledWith('sl-x');
    });
  });

  it('renders exclusions list with one row per OutboundExclusion', async () => {
    mockedGet.mockResolvedValueOnce({
      share_links: [],
      exclusions: [
        makeExclusion({
          resource_id: 's-x',
          resource_label: 'Excl App',
          excluded_user_id: 'u-1',
          excluded_user_display: 'Alice',
        }),
      ],
      invitations: [],
    });
    renderPanel();
    await waitFor(() => {
      expect(screen.getByText('Excl App')).toBeInTheDocument();
    });
    expect(screen.getByText(/Excluded: Alice/i)).toBeInTheDocument();
  });

  it('renders invitations and clicking revoke calls invitationsApi.revokeAny', async () => {
    mockedGet.mockResolvedValueOnce({
      share_links: [],
      exclusions: [],
      invitations: [makeInvitation({ id: 'inv-x', resource_label: 'Invite E' })],
    });
    renderPanel();
    await waitFor(() => {
      expect(screen.getByText('Invite E')).toBeInTheDocument();
    });
    const revokeBtn = screen.getByRole('button', {
      name: /Revoke invitation inv-x/i,
    });
    fireEvent.click(revokeBtn);
    const confirmBtn = await screen.findByRole('button', { name: /^Revoke$/ });
    fireEvent.click(confirmBtn);
    await waitFor(() => {
      expect(mockedRevokeAny).toHaveBeenCalledWith('inv-x');
    });
  });

  it('each resource label is a react-router Link to /<resource_type>s/<id>', async () => {
    mockedGet.mockResolvedValueOnce({
      share_links: [
        makeLink({
          id: 'sl-a',
          resource_type: 'track',
          resource_id: 't-link-id',
          resource_label: 'Track Label',
        }),
      ],
      exclusions: [
        makeExclusion({
          resource_type: 'app',
          resource_id: 's-link-id',
          resource_label: 'App Label',
          excluded_user_id: 'u-z',
        }),
      ],
      invitations: [
        makeInvitation({
          id: 'inv-link',
          resource_type: 'entry',
          resource_id: 'e-link-id',
          resource_label: 'Entry Label',
        }),
      ],
    });
    renderPanel();
    const trackLink = await screen.findByText('Track Label');
    expect(trackLink.closest('a')).toHaveAttribute('href', '/tracks/t-link-id');
    const appLink = screen.getByText('App Label');
    expect(appLink.closest('a')).toHaveAttribute('href', '/apps/s-link-id');
    const entryLink = screen.getByText('Entry Label');
    expect(entryLink.closest('a')).toHaveAttribute('href', '/entries/e-link-id');
  });
});
