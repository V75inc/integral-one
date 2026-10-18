import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { format } from 'date-fns';
import { CalendarWidget } from '../CalendarWidget';
import type { SavedView, EntryTypeNode } from '../../../types';

afterEach(cleanup);

describe('calendar draft creation', () => {
  it('passes the chosen date and type to a draft host without opening a saved entry', async () => {
    const onEntryCreate = vi.fn(async () => undefined);
    const onEntryEdit = vi.fn();
    const onEntryOpen = vi.fn();
    const fields = [{ key: 'due_date', name: 'Due date', type: 'date' as const }];
    render(<CalendarWidget entries={[]} isLoading={false} isEditor
      view={{ id: 'calendar', name: 'Due dates', track_id: 'tasks', type: 'calendar', config: {
        entry_type_keys: ['task'], calendar_mapping: { date_field: 'due_date' },
      } } as SavedView}
      fields={fields}
      entryTypes={[{ id: 'type-task', name: 'task', key: 'task', form_schema: { fields } } as EntryTypeNode]}
      trackDefaultEntryTypeKey="task"
      onEntryCreate={onEntryCreate} onEntryEdit={onEntryEdit} onEntryOpen={onEntryOpen} />);
    const today = new Date();
    fireEvent.click(screen.getByTitle(`Add entry on ${format(today, 'PPP')}`));
    await waitFor(() => expect(onEntryCreate).toHaveBeenCalledOnce());
    expect(onEntryCreate.mock.calls[0]).toEqual([expect.objectContaining({
      source: 'calendar', type: 'task', custom_fields: { due_date: format(today, 'yyyy-MM-dd') },
    })]);
    expect(onEntryEdit).not.toHaveBeenCalled();
    expect(onEntryOpen).not.toHaveBeenCalled();
  });
});
