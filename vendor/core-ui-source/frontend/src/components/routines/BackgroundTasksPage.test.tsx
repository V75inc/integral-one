import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { BackgroundTasksPage } from './BackgroundTasksPage';

vi.mock('../../context/CrumbsContext', () => ({ useSetCrumbs: () => undefined }));
vi.mock('../../context/ScopeContext', () => ({ useScopeOptional: () => null }));
vi.mock('../../api/routines', () => ({ listRoutines: async () => ({ routines: [] }) }));
vi.mock('./RoutinesListBody', () => ({ RoutinesListBody: () => null }));

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('Background Tasks navigation', () => {
  it('resolves the scheduled-routines link on client navigation', async () => {
    const scroll = vi.fn();
    const original = Object.getOwnPropertyDescriptor(Element.prototype, 'scrollIntoView');
    Object.defineProperty(Element.prototype, 'scrollIntoView', { value: scroll, configurable: true });
    try {
      render(<MemoryRouter initialEntries={['/background-tasks#scheduled-routines']}><BackgroundTasksPage /></MemoryRouter>);
      const section = await screen.findByRole('region', { name: 'Scheduled routines' });
      expect(section).toHaveAttribute('id', 'scheduled-routines');
      expect(scroll).toHaveBeenCalledWith({ block: 'start' });
    } finally {
      if (original) Object.defineProperty(Element.prototype, 'scrollIntoView', original);
      else Reflect.deleteProperty(Element.prototype, 'scrollIntoView');
    }
  });
});
