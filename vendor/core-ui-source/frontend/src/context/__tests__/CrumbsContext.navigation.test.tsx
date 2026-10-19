import { useEffect } from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { BrowserRouter, Link, Route, Routes } from 'react-router-dom';
import { CrumbsProvider, useCrumbs, useSetCrumbs } from '../CrumbsContext';
import type { Crumb } from '../../components/ui';

let publishOldTrail: (crumbs: Crumb[]) => void;
function Trail() {
  const { crumbs } = useCrumbs();
  return <nav aria-label="Breadcrumb">{crumbs.map(crumb => crumb.label).join(' > ')}</nav>;
}
function Track() {
  const { setCrumbs } = useCrumbs();
  useEffect(() => { publishOldTrail = setCrumbs; }, [setCrumbs]);
  useSetCrumbs([{ label: 'Tracks' }, { label: 'QA Bug Tracker 2026' }, { label: 'Bugs' }]);
  return <><h1>Bugs</h1><Link to="/apps">Go to Apps</Link></>;
}
function Apps() {
  useSetCrumbs([{ label: 'Apps' }]);
  return <><h1>Apps view</h1><Link to="/tracks/qa">Return to Track</Link></>;
}
afterEach(() => { cleanup(); window.history.replaceState(null, '', '/'); });

describe('route-owned breadcrumbs', () => {
  it('ignores a delayed breadcrumb publication from the previous route', async () => {
    window.history.replaceState(null, '', '/tracks/qa');
    render(<BrowserRouter><CrumbsProvider><Trail /><Routes>
      <Route path="/tracks/:id" element={<Track />} />
      <Route path="/apps" element={<Apps />} />
    </Routes></CrumbsProvider></BrowserRouter>);
    expect(screen.getByRole('navigation', { name: 'Breadcrumb' })).toHaveTextContent('Tracks > QA Bug Tracker 2026 > Bugs');
    const stalePublisher = publishOldTrail;
    fireEvent.click(screen.getByRole('link', { name: 'Go to Apps' }));
    expect(await screen.findByRole('heading', { name: 'Apps view' })).toBeVisible();
    expect(window.location.pathname).toBe('/apps');
    act(() => stalePublisher([{ label: 'Tracks' }, { label: 'QA Bug Tracker 2026' }, { label: 'Bugs' }]));
    expect(screen.getByRole('navigation', { name: 'Breadcrumb' })).toHaveTextContent(/^Apps$/);
    fireEvent.click(screen.getByRole('link', { name: 'Return to Track' }));
    await screen.findByRole('heading', { name: 'Bugs' });
    act(() => stalePublisher([{ label: 'Old track title' }]));
    expect(screen.getByRole('navigation', { name: 'Breadcrumb' })).toHaveTextContent('Tracks > QA Bug Tracker 2026 > Bugs');
  });
});
