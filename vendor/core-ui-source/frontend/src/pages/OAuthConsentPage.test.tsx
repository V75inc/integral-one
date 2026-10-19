/**
 * Task M3c-1 — OAuth consent page tests.
 *
 * The SPA route `/oauth/authorize?<oauth params>` is the authed surface that
 * completes the AS-driven authorize flow: an MCP client browser is 302'd from
 * `/api/oauth/authorize` to this route, which fetches consent details, renders
 * a themed consent card, and on approve/deny navigates the browser to the
 * AS-issued redirect (back to the MCP client with a code or an error).
 *
 * These tests mock `../api/oauthConsent` and assert:
 *   - client_name + each scope render from a mocked getConsent
 *   - Approve calls approve() with the parsed params, then window.location.assign
 *   - Deny calls deny() and assigns the deny redirect
 *   - loading state is shown before getConsent resolves
 *   - error state is shown if getConsent rejects
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  cleanup,
  render,
  screen,
  waitFor,
  fireEvent,
} from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { MemoryRouter } from 'react-router-dom';

const mockGetConsent = vi.fn();
const mockApprove = vi.fn();
const mockDeny = vi.fn();

vi.mock('../api/oauthConsent', () => ({
  getConsent: (...args: unknown[]) => mockGetConsent(...args),
  approve: (...args: unknown[]) => mockApprove(...args),
  deny: (...args: unknown[]) => mockDeny(...args),
}));

import { OAuthConsentPage } from './OAuthConsentPage';

const OAUTH_SEARCH =
  '?response_type=code&client_id=cli-123&redirect_uri=https%3A%2F%2Fclient.example%2Fcb' +
  '&scope=read%20write&state=xyz&code_challenge=abc&code_challenge_method=S256';

function setSearch(search: string): void {
  // The page reads OAuth params from the URL query. Drive that via the
  // router location so the component sees the same params the AS forwarded.
  window.history.pushState({}, '', `/oauth/authorize${search}`);
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={[`/oauth/authorize${OAUTH_SEARCH}`]}>
      <OAuthConsentPage />
    </MemoryRouter>,
  );
}

const CONSENT = {
  client_id: 'cli-123',
  client_name: 'Acme MCP Client',
  scopes: ['read', 'write'],
  redirect_uri: 'https://client.example/cb',
  state: 'xyz',
};

let assignSpy: ReturnType<typeof vi.fn>;

beforeEach(() => {
  mockGetConsent.mockReset();
  mockApprove.mockReset();
  mockDeny.mockReset();
  setSearch(OAUTH_SEARCH);
  // window.location.assign is a cross-origin nav — stub it.
  assignSpy = vi.fn();
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: { ...window.location, search: OAUTH_SEARCH, assign: assignSpy },
  });
});

afterEach(() => {
  cleanup();
});

describe('<OAuthConsentPage />', () => {
  it('shows a loading state before getConsent resolves', () => {
    let resolve!: (v: typeof CONSENT) => void;
    mockGetConsent.mockReturnValue(
      new Promise<typeof CONSENT>((r) => {
        resolve = r;
      }),
    );
    renderPage();
    expect(screen.getByRole('status')).toBeInTheDocument();
    resolve(CONSENT);
  });

  it('renders client_name and each requested scope', async () => {
    mockGetConsent.mockResolvedValue(CONSENT);
    renderPage();
    await waitFor(() => {
      expect(
        screen.getByRole('heading', { name: /Acme MCP Client/ }),
      ).toBeInTheDocument();
    });
    expect(screen.getByText('read')).toBeInTheDocument();
    expect(screen.getByText('write')).toBeInTheDocument();
  });

  it('approve calls approve() then assigns the returned redirect', async () => {
    mockGetConsent.mockResolvedValue(CONSENT);
    mockApprove.mockResolvedValue({
      redirect: 'https://client.example/cb?code=AUTHCODE&state=xyz',
    });
    renderPage();
    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: /approve/i }),
      ).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /approve/i }));

    await waitFor(() => {
      expect(mockApprove).toHaveBeenCalledTimes(1);
    });
    // Params parsed from the URL are forwarded to approve().
    const passed = mockApprove.mock.calls[0][0];
    expect(passed.client_id).toBe('cli-123');
    expect(passed.redirect_uri).toBe('https://client.example/cb');
    expect(passed.state).toBe('xyz');
    expect(passed.code_challenge).toBe('abc');

    await waitFor(() => {
      expect(assignSpy).toHaveBeenCalledWith(
        'https://client.example/cb?code=AUTHCODE&state=xyz',
      );
    });
  });

  it('deny calls deny() then assigns the deny redirect', async () => {
    mockGetConsent.mockResolvedValue(CONSENT);
    mockDeny.mockResolvedValue({
      redirect: 'https://client.example/cb?error=access_denied&state=xyz',
    });
    renderPage();
    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: /deny/i }),
      ).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /deny/i }));

    await waitFor(() => {
      expect(mockDeny).toHaveBeenCalledTimes(1);
    });
    await waitFor(() => {
      expect(assignSpy).toHaveBeenCalledWith(
        'https://client.example/cb?error=access_denied&state=xyz',
      );
    });
  });

  it('shows an error state when getConsent rejects', async () => {
    mockGetConsent.mockRejectedValue(new Error('boom'));
    renderPage();
    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });
  });
});
