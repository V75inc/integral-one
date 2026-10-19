import { render, screen, cleanup } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { AdminEntityLink, AdminOwnerCell } from '../AdminEntityLink';
afterEach(cleanup);
it('uses a friendly fallback while retaining the internal link target', () => {
  render(<MemoryRouter><AdminEntityLink type="app" id="n.App.internal" label=" " /></MemoryRouter>);
  expect(screen.getByRole('link', {name:'Unnamed app'})).toHaveAttribute('href','/admin/apps/n.App.internal');
  expect(screen.queryByText('n.App.internal')).not.toBeInTheDocument();
});
it('does not expose an owner ID when identity labels are missing', () => {
  render(<MemoryRouter><AdminOwnerCell owner={{id:'n.User.internal',display_name:'',email:''}} /></MemoryRouter>);
  expect(screen.getByRole('link', {name:'Unnamed user'})).toBeVisible();
  expect(screen.queryByText('n.User.internal')).not.toBeInTheDocument();
});
