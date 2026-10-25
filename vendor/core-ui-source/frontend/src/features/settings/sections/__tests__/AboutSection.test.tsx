import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { getBuildMetadata } from '../../../../api/meta';
import { AboutSection } from '../AboutSection';

vi.mock('../../../../api/meta', () => ({ getBuildMetadata: vi.fn() }));

afterEach(() => { cleanup(); vi.resetAllMocks(); });

function renderAbout() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}><AboutSection /></QueryClientProvider>);
}

describe('Integral Core version', () => {
  it('shows the running backend version instead of a frontend release constant', async () => {
    vi.mocked(getBuildMetadata).mockResolvedValue({ asset_version: 'build-123', core_version: '0.1.1rc31' });
    renderAbout();
    expect(screen.getByText('Integral Core')).toBeInTheDocument();
    expect(await screen.findByText('0.1.1rc31')).toBeInTheDocument();
    expect(screen.queryByText('0.1.0')).not.toBeInTheDocument();
  });

  it('handles servers without Core version metadata', async () => {
    vi.mocked(getBuildMetadata).mockResolvedValue({ asset_version: 'build-123' });
    renderAbout();
    expect(await screen.findByText('Unavailable')).toBeInTheDocument();
  });

  it('handles a metadata request failure without displaying a misleading version', async () => {
    vi.mocked(getBuildMetadata).mockRejectedValue(new Error('offline'));
    renderAbout();
    expect(await screen.findByText('Unavailable')).toBeInTheDocument();
  });
});
