/**
 * Phase 9 Plan 09-04 — NotificationsSection toggle matrix (NOTIF-03).
 *
 * Three cases (locked in plan):
 *   1. Renders 6 NotificationKinds × 3 channels = 18 checkboxes, each
 *      with aria-label `${kind} via ${channel}`.
 *   2. Toggling a cell invokes the PATCH client with the expected
 *      partial body.
 *   3. When `whatsapp.opted_in_at === null`, the WhatsApp column is
 *      disabled AND a "verify phone" link is present.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  render,
  screen,
  fireEvent,
  waitFor,
  cleanup,
} from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// Mock both the raw client fns AND the React Query hook wrappers.
// The component imports the hooks (`useNotificationPreferences` +
// `useUpdateNotificationPreferences`); replacing them with controlled
// implementations gives the test deterministic data + mutation capture
// without bridging through a QueryClient transport.
vi.mock('../../../../api/notificationPreferences', () => ({
  NOTIFICATION_PREFS_KEY: ['notification-preferences'],
  useNotificationPreferences: vi.fn(),
  useUpdateNotificationPreferences: vi.fn(),
  fetchNotificationPreferences: vi.fn(),
  patchNotificationPreferences: vi.fn(),
}));

import {
  fetchNotificationPreferences,
  patchNotificationPreferences,
  useNotificationPreferences,
  useUpdateNotificationPreferences,
} from '../../../../api/notificationPreferences';
import type { NotificationPreferences } from '../../../../api/notificationPreferences';
vi.mock('../../../../components/settings/WhatsAppSettings', () => ({ WhatsAppSettings: () => <button>Link WhatsApp number</button> }));

import { NotificationsSection } from '../NotificationsSection';

const mockedFetch = fetchNotificationPreferences as unknown as ReturnType<
  typeof vi.fn
>;
const mockedPatch = patchNotificationPreferences as unknown as ReturnType<
  typeof vi.fn
>;
const mockedUseQuery = useNotificationPreferences as unknown as ReturnType<
  typeof vi.fn
>;
const mockedUseMutation = useUpdateNotificationPreferences as unknown as ReturnType<
  typeof vi.fn
>;

function makePrefs(
  overrides: Partial<NotificationPreferences> = {},
): NotificationPreferences {
  const channelMatrix = { in_app: true, email: true, whatsapp: false };
  return {
    channels: { ...channelMatrix },
    kinds: {
      entry_update: { ...channelMatrix },
      mention: { ...channelMatrix },
      share: { ...channelMatrix },
      agent_pending_write: { ...channelMatrix },
      invitation: { ...channelMatrix },
      system: { in_app: true, email: false, whatsapp: false },
    },
    whatsapp: { opted_in_at: null, phone_e164: null },
    ...overrides,
  };
}

function renderSection() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={qc}>
      <NotificationsSection />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockedPatch.mockImplementation(async (partial: Partial<NotificationPreferences>) => ({
    ...makePrefs(),
    ...partial,
  }));
  // Default hook returns — tests override via mockReturnValueOnce.
  mockedUseQuery.mockReturnValue({
    data: makePrefs(),
    isLoading: false,
    isError: false,
    error: null,
  });
  mockedUseMutation.mockReturnValue({
    mutate: mockedPatch,
    isPending: false,
  });
});

afterEach(() => {
  cleanup();
});

describe('<NotificationsSection />', () => {
  it('offers retry when the initial query fails without data', () => {
    const refetch = vi.fn();
    mockedUseQuery.mockReturnValue({ data: undefined, isLoading: false, isError: true, error: new Error('Unavailable'), refetch });
    renderSection();
    expect(screen.getByRole('alert')).toHaveTextContent('Unavailable');
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(refetch).toHaveBeenCalledOnce();
  });
  it('prevents overlapping writes while a preference is saving', () => {
    mockedUseMutation.mockReturnValue({ mutate: mockedPatch, isPending: true });
    renderSection();
    for (const box of screen.getAllByRole('checkbox')) expect(box).toBeDisabled();
  });

  it('renders a 6×3 checkbox matrix with aria-labels', async () => {
    renderSection();
    expect(
      screen.getByRole('checkbox', { name: /mention via in_app/i }),
    ).toBeInTheDocument();
    const kinds = ['entry_update', 'mention', 'share', 'agent_pending_write', 'invitation', 'system'];
    const channels = ['in_app', 'email', 'whatsapp'];
    for (const kind of kinds) {
      for (const channel of channels) {
        const box = screen.getByRole('checkbox', {
          name: new RegExp(`${kind} via ${channel}`, 'i'),
        });
        expect(box).toBeInTheDocument();
      }
    }
    // Total: 18 checkboxes for the matrix.
    const all = screen.getAllByRole('checkbox');
    expect(all.length).toBe(18);
    expect(mockedFetch).toBeDefined();
  });

  it('toggling a cell PATCHes the API with the expected partial', async () => {
    renderSection();
    const cell = screen.getByRole('checkbox', {
      name: /share via email/i,
    });
    expect(cell).toBeChecked();
    fireEvent.click(cell);
    await waitFor(() => {
      expect(mockedPatch).toHaveBeenCalledTimes(1);
    });
    const partial = mockedPatch.mock.calls[0][0] as Partial<NotificationPreferences>;
    // Send only the changed cell; the server preserves concurrent changes.
    expect(partial).toEqual({ kinds: { share: { email: false } } });
  });

  it('disables WhatsApp column and shows verify-phone link when opted_in_at is null', async () => {
    renderSection();
    // All six whatsapp cells must be disabled when opted_in_at is null.
    expect(
      screen.getByRole('checkbox', { name: /mention via whatsapp/i }),
    ).toBeInTheDocument();
    const whatsappCells = screen
      .getAllByRole('checkbox')
      .filter(el => /via whatsapp/i.test(el.getAttribute('aria-label') ?? ''));
    expect(whatsappCells.length).toBe(6);
    for (const cell of whatsappCells) {
      expect(cell).toBeDisabled();
    }
    // A "verify phone" link must be present.
    expect(
      screen.getByRole('link', { name: /verify phone/i }),
    ).toBeInTheDocument();
  });
});
