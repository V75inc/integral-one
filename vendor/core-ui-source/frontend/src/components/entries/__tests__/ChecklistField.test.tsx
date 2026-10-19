import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import {
  checklistFieldRegistration,
  normalizeChecklist,
  parseChecklistForEditor,
} from '../fieldTypes/ChecklistField';
import type { OperationalModelFieldSpec } from '../../../types';

const field: OperationalModelFieldSpec = {
  key: 'checklist',
  name: 'Checklist',
  type: 'json',
};

describe('checklist normalize / parse', () => {
  it('normalize drops blank text; parse keeps drafts', () => {
    const raw = [
      { text: 'Ship', done: true },
      { text: '  ', done: false },
      { text: '', done: false },
    ];
    expect(normalizeChecklist(raw)).toEqual([{ text: 'Ship', done: true }]);
    expect(parseChecklistForEditor(raw)).toEqual([
      { text: 'Ship', done: true },
      { text: '  ', done: false },
      { text: '', done: false },
    ]);
  });
});

describe('ChecklistFieldEditor', () => {
  it('Add item keeps an empty draft row (not a no-op)', () => {
    const onChange = vi.fn();
    const Editor = checklistFieldRegistration.editor!;
    const { rerender } = render(
      <Editor field={field} value={[{ text: 'A', done: false }]} onChange={onChange} />
    );
    fireEvent.click(screen.getByRole('button', { name: /add item/i }));
    expect(onChange).toHaveBeenCalledWith([
      { text: 'A', done: false },
      { text: '', done: false },
    ]);
    const next = onChange.mock.calls[onChange.mock.calls.length - 1]?.[0];
    rerender(<Editor field={field} value={next} onChange={onChange} />);
    expect(screen.getAllByRole('textbox')).toHaveLength(2);
  });
});
