import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { AppCatalogRedirect } from '../components/apps/AppCatalogRedirect';

function Destination() {
  const location = useLocation();
  return <div>{location.pathname}{location.search}</div>;
}

describe('retired Operational Models screens', () => {
  it.each(['/models', '/operational-models'])('redirects %s to Manage Apps', path => {
    render(<MemoryRouter initialEntries={[path]}><Routes>
      <Route path={path} element={<AppCatalogRedirect />} />
      <Route path="/apps" element={<Destination />} />
    </Routes></MemoryRouter>);
    expect(screen.getByText('/apps?manage=1')).toBeInTheDocument();
  });
  it.each(['/models', '/operational-models'])('preserves package details from %s bookmarks', path => {
    render(<MemoryRouter initialEntries={[`${path}/app-model`]}><Routes>
      <Route path={`${path}/:id`} element={<AppCatalogRedirect />} />
      <Route path="/apps" element={<Destination />} />
    </Routes></MemoryRouter>);
    expect(screen.getByText('/apps?manage=1&package=app-model')).toBeInTheDocument();
  });
});
