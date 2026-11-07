import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { RecordReadBoundaryNotice } from '../RecordReadBoundaryNotice';

describe('App record coverage notice', () => {
  it('explains the missing coverage without asserting an empty workspace', () => {
    render(<MemoryRouter><RecordReadBoundaryNotice /></MemoryRouter>);
    expect(screen.getByRole('status')).toHaveTextContent('Records managed inside Apps are not included here');
    expect(screen.getByRole('link', { name: 'Open Apps' })).toHaveAttribute('href', '/apps');
    expect(screen.queryByText(/Nothing here yet|No matches|No entries yet/)).not.toBeInTheDocument();
  });

  it('describes search coverage and links to the already selected App', () => {
    render(<MemoryRouter><RecordReadBoundaryNotice searching appId="n.WorkspaceApp.example" /></MemoryRouter>);
    expect(screen.getByRole('status')).toHaveTextContent('This search does not include records managed inside Apps');
    expect(screen.getByRole('link', { name: 'Open App' })).toHaveAttribute('href', '/apps/n.WorkspaceApp.example');
  });
});
