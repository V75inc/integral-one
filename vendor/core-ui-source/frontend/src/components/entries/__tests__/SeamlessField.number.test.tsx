import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { SeamlessField } from '../SeamlessField';
import type { OperationalModelFieldSpec } from '../../../types';

afterEach(cleanup);

const field: OperationalModelFieldSpec = {
  key: 'base_salary',
  name: 'Base salary',
  type: 'number',
};

describe('number field editing', () => {
  it('holds an emptied field as null instead of snapping back to 0', () => {
    const change = vi.fn();
    render(<SeamlessField field={field} value={0} onChange={change} />);
    fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '' } });
    expect(change).toHaveBeenCalledWith(null);
  });

  it('does not prepend a zero when typing into a cleared field', () => {
    const change = vi.fn();
    const view = render(<SeamlessField field={field} value={null} onChange={change} />);
    const input = screen.getByRole('spinbutton') as HTMLInputElement;
    expect(input.value).toBe('');
    fireEvent.change(input, { target: { value: '1231' } });
    expect(change).toHaveBeenLastCalledWith(1231);
    view.rerender(<SeamlessField field={field} value={1231} onChange={change} />);
    expect(input.value).toBe('1231');
  });

  it('settles an emptied field to 0 on blur', () => {
    const change = vi.fn();
    render(<SeamlessField field={field} value={null} onChange={change} />);
    fireEvent.blur(screen.getByRole('spinbutton'));
    expect(change).toHaveBeenCalledWith(0);
  });
});
