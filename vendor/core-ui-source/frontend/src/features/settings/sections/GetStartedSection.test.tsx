import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { GetStartedSection } from './GetStartedSection';

afterEach(cleanup);

describe('getting started help', () => {
  it('offers a replayable introduction and links to model settings', async () => {
    const navigateToSection = vi.fn();
    render(<MemoryRouter><GetStartedSection navigateToSection={navigateToSection} /></MemoryRouter>);
    fireEvent.click(screen.getByRole('button', { name: 'Review introduction' }));
    expect(await screen.findByRole('dialog', { name: 'Welcome to Integral' })).toBeInTheDocument();
    expect(screen.getByText(/Entries are the individual records/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Connect a model' }));
    expect(navigateToSection).toHaveBeenCalledWith('ai-models');
  });
});
