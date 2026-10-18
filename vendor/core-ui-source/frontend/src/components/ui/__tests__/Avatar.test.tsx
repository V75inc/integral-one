/**
 * Avatar Vitest — Phase 9 Plan 09-01 (AVT-02).
 *
 * Pins the behaviour contract:
 *
 *   - When ``attachmentId`` + ``userId`` are supplied, the component
 *     fetches the backend variant route
 *     ``/users/{id}/avatar?size={pixelSize}&v={version}`` (with the
 *     cache-bust ``v`` query param when ``version`` is non-empty) via
 *     the apiClient (auth-bearing) and renders the response as a
 *     ``blob:`` URL inside ``<img>``.
 *
 *   - When ``attachmentId`` is absent, no ``<img>`` is rendered — the
 *     fallback initials block takes over (the existing pre-AVT-02 path).
 */
import { describe, it, expect, afterEach, vi, beforeEach } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

vi.mock('../../../api/client', () => ({
  default: { get: vi.fn() },
}));

import apiClient from '../../../api/client';
import { Avatar } from '../Avatar';

afterEach(() => cleanup());

beforeEach(() => {
  (apiClient.get as unknown as { mockReset: () => void }).mockReset();
  (apiClient.get as unknown as { mockResolvedValue: (v: unknown) => void }).mockResolvedValue({
    data: new Blob(['fake'], { type: 'image/png' }),
  });
  // jsdom doesn't define createObjectURL / revokeObjectURL.
  (URL as unknown as { createObjectURL: (b: Blob) => string }).createObjectURL = () =>
    'blob:mock-url';
  (URL as unknown as { revokeObjectURL: (u: string) => void }).revokeObjectURL = () => {};
});

describe('Avatar (AVT-02 — attachment URL preference)', () => {
  it('fetches the backend variant route via apiClient when attachmentId+userId set', async () => {
    render(
      <Avatar
        name="Jane Doe"
        attachmentId="a-1"
        userId="o.User.jane"
        version={1700000000}
      />,
    );
    await waitFor(() => {
      expect(apiClient.get).toHaveBeenCalled();
    });
    const callArg = (apiClient.get as unknown as { mock: { calls: unknown[][] } })
      .mock.calls[0][0] as string;
    expect(callArg).toMatch(/^\/users\/.+\/avatar\?size=128&v=1700000000$/);
    const img = await screen.findByRole('img');
    expect(img.getAttribute('src')).toBe('blob:mock-url');
  });

  it('renders initials (no <img>) when attachmentId is omitted', () => {
    render(<Avatar name="Jane Doe" />);
    expect(screen.queryByRole('img')).toBeNull();
    // Initials of "Jane Doe" land in the DOM as text.
    expect(screen.getByText('JD')).toBeInTheDocument();
  });
});
