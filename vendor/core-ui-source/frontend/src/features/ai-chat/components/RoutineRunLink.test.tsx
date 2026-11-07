import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { RoutineRunLink } from './RoutineRunLink';

afterEach(cleanup);

describe('scheduled run management link', () => {
  it.each([
    { interactPayload: { origin: 'routine_task', routine_id: 'n.RoutineTask.example' } },
    { origin: 'routine_task', routine_id: 'n.RoutineTask.example' },
    { interact_payload: { origin: 'routine_task', routine_id: 'n.RoutineTask.example' } },
  ])('links a persisted run to its exact routine', metadata => {
    render(<MemoryRouter><RoutineRunLink metadata={metadata} /></MemoryRouter>);
    expect(screen.getByRole('link', { name: 'Manage this scheduled routine' })).toHaveAttribute('href', '/background-tasks?routine=n.RoutineTask.example#scheduled-routines');
  });
  it('never invents a schedule identity for legacy runs', () => {
    render(<MemoryRouter><RoutineRunLink metadata={{ origin: 'routine_task' }} /></MemoryRouter>);
    expect(screen.getByRole('link', { name: 'Manage scheduled routines' })).toHaveAttribute('href', '/background-tasks#scheduled-routines');
  });
  it('ignores ordinary chat and encodes supplied identifiers as one parameter', () => {
    const view = render(<MemoryRouter><RoutineRunLink metadata={{ origin: 'user', routine_id: 'wrong' }} /></MemoryRouter>);
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    view.rerender(<MemoryRouter><RoutineRunLink metadata={{ origin: 'routine_task', routine_id: 'id&other=value#x' }} /></MemoryRouter>);
    expect(screen.getByRole('link')).toHaveAttribute('href', '/background-tasks?routine=id%26other%3Dvalue%23x#scheduled-routines');
  });
});
