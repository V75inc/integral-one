import { describe, it, expect } from 'vitest';
import {
  planSprintTaskMembershipSync,
  shouldClearTaskSprintLink,
} from '../sprintTaskSync';

describe('planSprintTaskMembershipSync', () => {
  it('adds newly selected tasks and removes dropped ones', () => {
    const plan = planSprintTaskMembershipSync({
      nextTaskIds: ['t2', 't3'],
      referencedBy: [
        { id: 't1', field_key: 'sprint' },
        { id: 't2', field_key: 'sprint' },
        { id: 'other', field_key: 'project' },
      ],
    });
    expect(plan.toAdd.sort()).toEqual(['t3']);
    expect(plan.toRemove.sort()).toEqual(['t1']);
  });

  it('includes currentTaskIds in prevIds when planning sync', () => {
    const plan = planSprintTaskMembershipSync({
      nextTaskIds: ['t2'],
      referencedBy: [],
      currentTaskIds: ['t1', 't2'],
    });
    expect(plan.toAdd).toEqual([]);
    expect(plan.toRemove).toEqual(['t1']);
  });

  it('ignores referencedBy with missing or empty field_key', () => {
    const plan = planSprintTaskMembershipSync({
      nextTaskIds: [],
      referencedBy: [{ id: 't1' }, { id: 't2', field_key: '' }],
    });
    expect(plan.toRemove).toEqual([]);
  });

  it('ignores blank ids and non-array next values', () => {
    expect(
      planSprintTaskMembershipSync({
        nextTaskIds: ['', '  ', 't1'],
        referencedBy: [],
      })
    ).toEqual({ toAdd: ['t1'], toRemove: [] });
    expect(
      planSprintTaskMembershipSync({
        nextTaskIds: null,
        referencedBy: [{ id: 't1', field_key: 'sprint' }],
      })
    ).toEqual({ toAdd: [], toRemove: ['t1'] });
  });
});

describe('shouldClearTaskSprintLink', () => {
  it('clears when empty or still pointing at this sprint', () => {
    expect(shouldClearTaskSprintLink(null, 's1')).toBe(true);
    expect(shouldClearTaskSprintLink('', 's1')).toBe(true);
    expect(shouldClearTaskSprintLink('s1', 's1')).toBe(true);
    expect(shouldClearTaskSprintLink(['s1'], 's1')).toBe(true);
    expect(shouldClearTaskSprintLink({ id: 's1' }, 's1')).toBe(true);
  });

  it('does not clear when the task already moved to another sprint', () => {
    expect(shouldClearTaskSprintLink('s2', 's1')).toBe(false);
    expect(shouldClearTaskSprintLink(['s2'], 's1')).toBe(false);
    expect(shouldClearTaskSprintLink({ id: 's2' }, 's1')).toBe(false);
  });
});
