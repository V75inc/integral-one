import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { BackgroundTasksPage } from './BackgroundTasksPage';

vi.mock('../../context/CrumbsContext', () => ({ useSetCrumbs: () => undefined }));
vi.mock('../../context/ScopeContext', () => ({ useScopeOptional: () => null }));
const { list, get } = vi.hoisted(() => ({ list: vi.fn(), get: vi.fn() }));
vi.mock('../../api/routines', () => ({ listRoutines: list, getRoutine: get }));
beforeEach(() => { list.mockReset().mockResolvedValue({ routines: [] }); get.mockReset(); });
vi.mock('./RoutinesListBody', () => ({ RoutinesListBody: ({ rows, selectedRoutineId }: { rows: Array<{ id: string; instruction: string }>; selectedRoutineId?: string }) => <div data-testid="routine-list" data-selected={selectedRoutineId}>{rows.map(row => <p key={row.id}>{row.instruction}</p>)}</div> }));

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


it('fetches an exact linked routine even when cancelled routines are excluded from the list', async () => {
  get.mockResolvedValue({ id: 'cancelled-one', instruction: 'Previously cancelled task', status: 'cancelled' });
  render(<MemoryRouter initialEntries={['/background-tasks?routine=cancelled-one#scheduled-routines']}><BackgroundTasksPage /></MemoryRouter>);
  expect(await screen.findByText('Previously cancelled task')).toBeInTheDocument();
  expect(get).toHaveBeenCalledWith('cancelled-one');
  expect(screen.getByTestId('routine-list')).toHaveAttribute('data-selected', 'cancelled-one');
});

it('keeps the routine list usable when a linked routine is deleted or inaccessible', async () => {
  get.mockRejectedValue(new Error('Not found'));
  render(<MemoryRouter initialEntries={['/background-tasks?routine=missing']}><BackgroundTasksPage /></MemoryRouter>);
  expect(await screen.findByText('This routine is unavailable or you no longer have access to it.')).toBeInTheDocument();
  expect(screen.getByRole('region', { name: 'Scheduled routines' })).toBeInTheDocument();
});
